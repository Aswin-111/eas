// controllers/auth.controller.js
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import UserMast from "../models/UserMast.js";

dotenv.config();

export const login = async (req, res) => {
  const { user_name, user_password } = req.body;

  try {
    const user = await UserMast.findOne({ user_name });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.user_password) {
      return res.status(401).json({ message: "Password not set for this user" });
    }

    const isMatch = await bcrypt.compare(
      String(user_password),
      user.user_password
    );

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // 🔐 JWT PAYLOAD (keep it minimal)
    const payload = {
      user: {
        comp_code: user.comp_code,
        user_id: user.user_id,
        user_name: user.user_name,
        user_type: user.user_type,
      },
    };

    // 🔑 SIGN TOKEN
    const token = jwt.sign(
      payload,
      process.env.JWT_SECRET || "supersecret",
      { expiresIn: "7d" } // adjust if needed
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
