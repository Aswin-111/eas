// controllers/session.controller.js
import CompMast from "../models/CompMast.js";
import UserSession from "../models/UserSession.js";
import {
  getActiveSessions,
  formatSessionPublic,
  revokeSession,
  revokeSessionById,
  getSessionLimit,
} from "../utils/sessionManager.js";

const sessionController = {
  // ------------------------------------------
  // ✅ USER: log out current device (revokes the token that's calling this)
  // ------------------------------------------
  logout: async (req, res) => {
    try {
      const jti = req.jti; // set by auth middleware

      if (!jti) {
        return res.status(400).json({ message: "No active session on this token" });
      }

      const revoked = await revokeSession(jti, "self");

      if (!revoked) {
        return res.status(404).json({ message: "Session already inactive" });
      }

      return res.status(200).json({ message: "Logged out successfully" });
    } catch (error) {
      console.error("logout error:", error);
      return res.status(500).json({ message: "Internal server error", error: error.message });
    }
  },

  // ------------------------------------------
  // ✅ USER: list my own active sessions/devices
  // ------------------------------------------
  getMySessions: async (req, res) => {
    try {
      const comp_code = req.comp_code;
      const user_id = req.user?.user_id;

      const sessions = await getActiveSessions(comp_code, user_id);
      const limit = await getSessionLimit(comp_code);

      return res.status(200).json({
        limit,
        active_count: sessions.length,
        sessions: sessions.map(formatSessionPublic),
      });
    } catch (error) {
      console.error("getMySessions error:", error);
      return res.status(500).json({ message: "Internal server error", error: error.message });
    }
  },

  // ------------------------------------------
  // ✅ USER: revoke one of my own sessions by id (e.g. to free a slot
  // for a new device without waiting for expiry)
  // ------------------------------------------
  revokeMySession: async (req, res) => {
    try {
      const { session_id } = req.params;
      const comp_code = req.comp_code;
      const user_id = req.user?.user_id;

      const revoked = await revokeSessionById(session_id, { comp_code, user_id }, "self");

      if (!revoked) {
        return res.status(404).json({ message: "Session not found or already inactive" });
      }

      return res.status(200).json({ message: "Session revoked successfully" });
    } catch (error) {
      console.error("revokeMySession error:", error);
      return res.status(500).json({ message: "Internal server error", error: error.message });
    }
  },

  // ------------------------------------------
  // ✅ ADMIN: set session_limit for a comp_code
  // ------------------------------------------
  setSessionLimit: async (req, res) => {
    try {
      const { comp_code, session_limit } = req.body;

      if (!comp_code) {
        return res.status(400).json({ message: "comp_code is required" });
      }

      const limitNum = Number(session_limit);
      if (!Number.isFinite(limitNum) || limitNum <= 0 || !Number.isInteger(limitNum)) {
        return res.status(400).json({ message: "session_limit must be a positive integer" });
      }

      const updated = await CompMast.findOneAndUpdate(
        { comp_code: String(comp_code) },
        { $set: { session_limit: limitNum } },
        { new: true }
      );

      if (!updated) {
        return res.status(404).json({ message: `Company ${comp_code} not found` });
      }

      return res.status(200).json({
        message: "Session limit updated successfully",
        comp_code: updated.comp_code,
        session_limit: updated.session_limit,
      });
    } catch (error) {
      console.error("setSessionLimit error:", error);
      return res.status(500).json({ message: "Internal server error", error: error.message });
    }
  },

  // ------------------------------------------
  // ✅ ADMIN: view all active sessions for a comp_code (optionally filter by user_id)
  // ------------------------------------------
  getSessionsForCompany: async (req, res) => {
    try {
      const comp_code = String(req.query.comp_code || "").trim();
      const user_id = req.query.user_id ? String(req.query.user_id).trim() : null;

      if (!comp_code) {
        return res.status(400).json({ message: "comp_code is required" });
      }

      const query = {
        comp_code,
        revoked: false,
        expires_at: { $gt: new Date() },
      };
      if (user_id) query.user_id = user_id;

      const sessions = await UserSession.find(query).sort({ user_id: 1, last_active: -1 }).lean();
      const limit = await getSessionLimit(comp_code);

      // Group by user_id for a friendlier admin view
      const byUser = {};
      for (const s of sessions) {
        if (!byUser[s.user_id]) byUser[s.user_id] = [];
        byUser[s.user_id].push({
          session_id: s._id,
          device_label: s.device_label || "Unknown device",
          user_agent: s.user_agent || "",
          ip_address: s.ip_address || "",
          issued_at: s.issued_at,
          last_active: s.last_active,
          expires_at: s.expires_at,
        });
      }

      return res.status(200).json({
        comp_code,
        session_limit: limit,
        total_active_sessions: sessions.length,
        users: byUser,
      });
    } catch (error) {
      console.error("getSessionsForCompany error:", error);
      return res.status(500).json({ message: "Internal server error", error: error.message });
    }
  },

  // ------------------------------------------
  // ✅ ADMIN: force-revoke any session by id (e.g. kick a lost/stolen device)
  // ------------------------------------------
  adminRevokeSession: async (req, res) => {
    try {
      const { session_id } = req.params;

      const revoked = await revokeSessionById(session_id, {}, "admin");

      if (!revoked) {
        return res.status(404).json({ message: "Session not found or already inactive" });
      }

      return res.status(200).json({ message: "Session revoked by admin" });
    } catch (error) {
      console.error("adminRevokeSession error:", error);
      return res.status(500).json({ message: "Internal server error", error: error.message });
    }
  },
};

export default sessionController;