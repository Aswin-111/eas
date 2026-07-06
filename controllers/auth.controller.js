// controllers/auth.controller.js — full replacement.
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import UserMast from "../models/UserMast.js";
import Admin from "../models/Admin.js";
import WhitelistedDevice from "../models/WhitelistedDevice.js";

dotenv.config();

export const login = async (req, res) => {
  const { user_name, user_password, mac_address } = req.body;

  try {
    // ✅ 1. CHECK ADMIN FIRST (unchanged — admins are not MAC-restricted)
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

    // ✅ 3. MAC WHITELIST CHECK (new — replaces the old session-limit feature)
    const macAddress = String(mac_address || "").trim();

    if (!macAddress) {
      return res.status(400).json({ message: "mac_address is required" });
    }

    const isWhitelisted = await WhitelistedDevice.findOne({
      comp_code: String(user.comp_code),
      mac_address: macAddress,
    }).lean();

    if (!isWhitelisted) {
      return res.status(403).json({
        message: "This device is not approved. Please ask your admin to approve this login.",
        mac_address: macAddress,
      });
    }

    // ✅ 4. USER TOKEN (unchanged from original — no session/jti tracking)
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
      expiresIn: "7d",
    });

    return res.json({
      token,
      user: payload.user,
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// ✅ NEW: billing-admin-sec login
// Simple UserMast-only login, no mac_address/device-whitelist/session logic at all.
// Only requires user_name and user_password.
export const billingAdminLogin = async (req, res) => {
  const { user_name, user_password } = req.body;

  if (!user_name || !user_password) {
    return res.status(400).json({ message: "user_name and user_password are required" });
  }

  try {
    const user = await UserMast.findOne({ user_name });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isMatch = await bcrypt.compare(String(user_password), user.user_password);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

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
      expiresIn: "7d",
    });

    return res.json({
      token,
      user: payload.user,
    });
  } catch (error) {
    console.error("Billing admin login error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};