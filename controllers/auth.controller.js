// controllers/auth.controller.js — replace the existing file's `login`
// export with this version. Admin login is left session-less (unchanged)
// since session limits apply to comp_code users, not admins — adjust if you
// want admins limited too.

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import UserMast from "../models/UserMast.js";
import Admin from "../models/Admin.js";
import { tryCreateSession, formatSessionPublic } from "../utils/sessionManager.js";

dotenv.config();

const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7d, matches existing expiresIn: "7d"

export const login = async (req, res) => {
  const { user_name, user_password, device_label } = req.body;

  try {
    // ✅ 1. CHECK ADMIN FIRST (unchanged — admins are not session-limited)
    const admin = await Admin.findOne({ username: user_name });

    if (admin) {
      const isMatch = await bcrypt.compare(String(user_password), admin.password);

      if (!isMatch) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const payload = {
        user: {
          role: "admin",
          admin_id: admin._id,
          username: admin.username,
        },
      };

      const token = jwt.sign(payload, process.env.JWT_SECRET || "supersecret", {
        expiresIn: "7d",
      });

      return res.json({ token, user: payload.user });
    }

    // ✅ 2. EXISTING USER LOGIN
    const user = await UserMast.findOne({ user_name });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isMatch = await bcrypt.compare(String(user_password), user.user_password);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // ✅ 3. ENFORCE PER-USER SESSION LIMIT (new)
    const ip_address =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "";
    const user_agent = req.headers["user-agent"] || "";

    const sessionResult = await tryCreateSession({
      comp_code: user.comp_code,
      user_id: user.user_id,
      expiresInSeconds: TOKEN_TTL_SECONDS,
      device_label,
      user_agent,
      ip_address,
    });

    if (!sessionResult.allowed) {
      return res.status(409).json({
        message: `Device login limit reached (${sessionResult.limit}). Log out from another device to continue.`,
        limit: sessionResult.limit,
        active_sessions: sessionResult.active_sessions,
      });
    }

    // ✅ 4. USER TOKEN — now carries jti, ties this token to its session record
    const payload = {
      user: {
        role: "user",
        comp_code: user.comp_code,
        user_id: user.user_id,
        user_name: user.user_name,
        user_type: user.user_type,
      },
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET || "supersecret", {
      expiresIn: TOKEN_TTL_SECONDS,
      jwtid: sessionResult.jti,
    });

    return res.json({
      token,
      user: payload.user,
      session: formatSessionPublic(sessionResult.session),
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};