// middleware/auth.js — full replacement.
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { isSessionActive, touchSession } from "../utils/sessionManager.js";

dotenv.config();

const auth = async (req, res, next) => {
  let token = null;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  }

  if (!token && req.header("x-auth-token")) {
    token = req.header("x-auth-token");
  }

  if (!token) {
    return res.status(401).json({ msg: "No token, authorization denied" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "supersecret");

    req.user = decoded.user;
    req.comp_code = decoded.user?.comp_code;

    if (!req.comp_code) {
      return res.status(401).json({ msg: "Token missing comp_code" });
    }

    // ✅ NEW: confirm this token's session hasn't been revoked/logged out.
    // decoded.jti is set by jwt.sign(..., { jwtid: sessionResult.jti }) at login.
    const jti = decoded.jti;
    if (!jti) {
      // Tokens issued before this feature shipped won't have a jti.
      // Reject them so all active sessions go through the new session tracking.
      return res.status(401).json({ msg: "Session not recognized, please log in again" });
    }

    const active = await isSessionActive(jti);
    if (!active) {
      return res.status(401).json({ msg: "Session expired or logged out, please log in again" });
    }

    req.jti = jti;
    touchSession(jti); // fire-and-forget, doesn't block the request

    next();
  } catch (err) {
    return res.status(401).json({ msg: "Token is not valid" });
  }
};

export default auth;