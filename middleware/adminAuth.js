import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const adminAuth = (req, res, next) => {
    try {
        let token = null;

        // 1️⃣ Extract token
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith("Bearer ")) {
            token = authHeader.split(" ")[1];
        }

        // fallback
        if (!token && req.header("x-auth-token")) {
            token = req.header("x-auth-token");
        }

        if (!token) {
            return res.status(401).json({
                message: "No token provided",
            });
        }

        // 2️⃣ Verify token
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET || "supersecret"
        );

        // 3️⃣ Strict admin validation
        if (!decoded.user || decoded.user.role !== "admin") {
            return res.status(403).json({
                message: "Access denied: Admins only",
            });
        }

        // 4️⃣ Attach admin info
        req.admin = {
            id: decoded.user.admin_id,
            username: decoded.user.username,
        };

        next();
    } catch (error) {
        return res.status(401).json({
            message: "Invalid or expired token",
        });
    }
};

export default adminAuth;