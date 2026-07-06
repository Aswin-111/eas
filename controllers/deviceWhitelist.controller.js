// controllers/deviceWhitelist.controller.js
//
// Replaces controllers/session.controller.js entirely.
import WhitelistedDevice from "../models/WhitelistedDevice.js";

const deviceWhitelistController = {
  // ------------------------------------------
  // ✅ ADMIN: whitelist a MAC/device for a comp_code
  // body: { comp_code, mac_address, label }  (label required — admin names
  // the device at creation time, e.g. "User1 Phone")
  // ------------------------------------------
  addWhitelistedDevice: async (req, res) => {
    try {
      const comp_code = String(req.body?.comp_code || "").trim();
      const mac_address = String(req.body?.mac_address || "").trim();
      const label = String(req.body?.label || "").trim();
      const added_by = req.admin?.username || "";

      if (!comp_code || !mac_address || !label) {
        return res.status(400).json({
          message: "comp_code, mac_address, and label are all required",
        });
      }

      const existing = await WhitelistedDevice.findOne({ comp_code, mac_address }).lean();
      if (existing) {
        return res.status(409).json({
          message: "This device is already whitelisted for this comp_code",
          data: existing,
        });
      }

      const device = await WhitelistedDevice.create({
        comp_code,
        mac_address,
        label,
        added_by,
      });

      return res.status(201).json({
        message: "Device whitelisted successfully",
        data: device,
      });
    } catch (error) {
      if (error?.code === 11000) {
        return res.status(409).json({
          message: "This device is already whitelisted for this comp_code",
        });
      }
      console.error("addWhitelistedDevice error:", error);
      return res.status(500).json({
        message: "Internal server error",
        error: error.message,
      });
    }
  },

  // ------------------------------------------
  // ✅ ADMIN: edit a whitelisted device's label (rename)
  // body: { label }
  // ------------------------------------------
  editWhitelistedDevice: async (req, res) => {
    try {
      const { device_id } = req.params;
      const label = String(req.body?.label || "").trim();

      if (!device_id) {
        return res.status(400).json({ message: "device_id is required" });
      }
      if (!label) {
        return res.status(400).json({ message: "label is required" });
      }

      const updated = await WhitelistedDevice.findByIdAndUpdate(
        device_id,
        { $set: { label } },
        { new: true }
      );

      if (!updated) {
        return res.status(404).json({ message: "Whitelisted device not found" });
      }

      return res.status(200).json({
        message: "Device label updated successfully",
        data: updated,
      });
    } catch (error) {
      console.error("editWhitelistedDevice error:", error);
      return res.status(500).json({
        message: "Internal server error",
        error: error.message,
      });
    }
  },

  // ------------------------------------------
  // ✅ ADMIN: list whitelisted devices for a comp_code
  // query: ?comp_code=
  // ------------------------------------------
  getWhitelistedDevices: async (req, res) => {
    try {
      const comp_code = String(req.query?.comp_code || "").trim();

      if (!comp_code) {
        return res.status(400).json({ message: "comp_code is required" });
      }

      const devices = await WhitelistedDevice.find({ comp_code })
        .sort({ createdAt: -1 })
        .lean();

      return res.status(200).json({
        comp_code,
        count: devices.length,
        data: devices,
      });
    } catch (error) {
      console.error("getWhitelistedDevices error:", error);
      return res.status(500).json({
        message: "Internal server error",
        error: error.message,
      });
    }
  },

  // ------------------------------------------
  // ✅ ADMIN: remove a whitelisted device (revoke access)
  // ------------------------------------------
  removeWhitelistedDevice: async (req, res) => {
    try {
      const { device_id } = req.params;

      if (!device_id) {
        return res.status(400).json({ message: "device_id is required" });
      }

      const result = await WhitelistedDevice.deleteOne({ _id: device_id });

      if (result.deletedCount === 0) {
        return res.status(404).json({ message: "Whitelisted device not found" });
      }

      return res.status(200).json({ message: "Device removed from whitelist" });
    } catch (error) {
      console.error("removeWhitelistedDevice error:", error);
      return res.status(500).json({
        message: "Internal server error",
        error: error.message,
      });
    }
  },
};

export default deviceWhitelistController;