// models/UserSession.js
import mongoose from "mongoose";

const userSessionSchema = new mongoose.Schema(
  {
    comp_code: { type: String, required: true },
    user_id: { type: String, required: true },
    jti: { type: String, required: true, unique: true }, // matches JWT's jti claim
    device_label: { type: String, default: "" }, // optional client-supplied label, e.g. "Redmi Note 12"
    user_agent: { type: String, default: "" },
    ip_address: { type: String, default: "" },
    issued_at: { type: Date, default: Date.now },
    expires_at: { type: Date, required: true }, // mirrors JWT expiry, used for TTL cleanup
    last_active: { type: Date, default: Date.now },
    revoked: { type: Boolean, default: false },
    revoked_at: { type: Date },
    revoked_by: { type: String }, // "self" | "admin" | "system"
  },
  {
    timestamps: true,
  }
);

// Fast lookup: active sessions per user
userSessionSchema.index({ comp_code: 1, user_id: 1, revoked: 1 });

// Fast lookup for auth middleware verifying a specific token's session
userSessionSchema.index({ jti: 1 });

// Auto-remove documents once expires_at has passed (MongoDB TTL index).
// Kept even after revocation so admin can look at recent history briefly;
// remove immediately on revoke if you'd rather not retain revoked docs.
userSessionSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

const UserSession = mongoose.model("UserSession", userSessionSchema);

export default UserSession;