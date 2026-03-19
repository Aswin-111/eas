// controllers/auth.controller.js
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import UserMast from "../models/UserMast.js";
import Admin from "../models/Admin.js";
dotenv.config();



export const login = async (req, res) => {
  const { user_name, user_password } = req.body;

  try {
    // ✅ 1. CHECK ADMIN FIRST
    const admin = await Admin.findOne({ username: user_name });

    if (admin) {
      const isMatch = await bcrypt.compare(
        String(user_password),
        admin.password
      );

      if (!isMatch) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // ✅ ADMIN TOKEN
      const payload = {
        user: {
          role: "admin",
          admin_id: admin._id,
          username: admin.username,
        },
      };

      const token = jwt.sign(
        payload,
        process.env.JWT_SECRET || "supersecret",
        { expiresIn: "7d" }
      );

      return res.json({
        token,
        user: payload.user,
      });
    }

    // ✅ 2. EXISTING USER LOGIN (UNCHANGED)
    const user = await UserMast.findOne({ user_name });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isMatch = await bcrypt.compare(
      String(user_password),
      user.user_password
    );

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // ✅ USER TOKEN (just add role)
    const payload = {
      user: {
        role: "user", // 👈 NEW
        comp_code: user.comp_code,
        user_id: user.user_id,
        user_name: user.user_name,
        user_type: user.user_type,
      },
    };

    const token = jwt.sign(
      payload,
      process.env.JWT_SECRET || "supersecret",
      { expiresIn: "7d" }
    );

    return res.json({
      token,
      user: payload.user,
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};