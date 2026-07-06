// middleware/auth.js — full replacement.
//
// Unlike a fully stateless JWT, this middleware performs one lightweight
// DB check per request: does (comp_code, mac_address) still exist in the
// whitelist? This is what makes admin deletion take effect immediately,
// rather than waiting out the JWT's 7-day expiry.
//
// The client must send its device's mac_address on every authenticated
// request (not just at login) via the `x-mac-address` header.
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import WhitelistedDevice from "../models/WhitelistedDevice.js";

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

    const macAddress = req.header("x-mac-address");

    if (!macAddress) {
      return res.status(401).json({ msg: "Device identifier missing, please log in again" });
    }

    const stillWhitelisted = await WhitelistedDevice.findOne({
      comp_code: req.comp_code,
      mac_address: String(macAddress).trim(),
    }).lean();

    if (!stillWhitelisted) {
      return res.status(401).json({
        msg: "This device's access has been revoked. Please contact your admin.",
      });
    }

    req.mac_address = macAddress;
    next();
  } catch (err) {
    return res.status(401).json({ msg: "Token is not valid" });
  }
};

export default auth;