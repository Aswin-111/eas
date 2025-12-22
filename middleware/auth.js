// middleware/auth.js
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const auth = (req, res, next) => {
  let token = null;

  // Authorization: Bearer <token>
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  }

  // fallback: x-auth-token
  if (!token && req.header("x-auth-token")) {
    token = req.header("x-auth-token");
  }

  if (!token) {
    return res.status(401).json({ msg: "No token, authorization denied" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "supersecret");

    // decoded payload structure we used: { user: { comp_code, user_id, user_name, user_type } }
    req.user = decoded.user;

    // convenience
    req.comp_code = decoded.user?.comp_code;

    if (!req.comp_code) {
      return res.status(401).json({ msg: "Token missing comp_code" });
    }

    next();
  } catch (err) {
    return res.status(401).json({ msg: "Token is not valid" });
  }
};

export default auth;
