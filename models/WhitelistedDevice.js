// models/WhitelistedDevice.js
//
// Replaces the old UserSession-based device-limit feature entirely.
// One document per (comp_code, mac_address) pair that an admin has approved.
// Any user logging in under that comp_code from a whitelisted mac_address
// is allowed in; any comp_code + mac_address combination not present here
// is rejected at login.
import mongoose from "mongoose";

const whitelistedDeviceSchema = new mongoose.Schema(
  {
    comp_code: { type: String, required: true, trim: true },
    mac_address: { type: String, required: true, trim: true }, // device fingerprint (see note below)
    label: { type: String, default: "" }, // admin-set device name, e.g. "Counter PC 1" or "User1 Phone"
    added_by: { type: String, default: "" }, // admin username, for audit trail
  },
  {
    timestamps: true,
  }
);

// One whitelist entry per comp_code + mac_address.
whitelistedDeviceSchema.index({ comp_code: 1, mac_address: 1 }, { unique: true });

const WhitelistedDevice = mongoose.model("WhitelistedDevice", whitelistedDeviceSchema);

export default WhitelistedDevice;

/*
  NOTE on "mac_address":
  On modern Android (6+) and iOS, apps cannot read the real hardware MAC
  address — the OS returns a fixed dummy value (02:00:00:00:00:00) for
  privacy reasons. So `mac_address` here is really a stable per-install
  device identifier (e.g. Android ID via device_info_plus, or a UUID the
  app generates once and persists locally). It behaves identically to a
  MAC for whitelisting purposes (stable, unique per device), so the field
  name is kept as `mac_address` for continuity with what the admin/user
  actually types and refers to.
*/