// models/CustMast.js
import mongoose from "mongoose";

const custMastSchema = new mongoose.Schema(
  {
    comp_code: { type: String, required: true }, // was Number -> make consistent with rest
    cust_code: { type: String, required: true }, // was Number -> MUST be String for "*"
    cust_name: { type: String, required: true },
    cust_address: { type: String },
    cust_phone: { type: String },
    cust_area: { type: String },
    cust_type: { type: String, default: "R" },
    cust_gst: { type: String },
    Old_bal: { type: Number },
  },
  {
    timestamps: true,
  }
);

custMastSchema.index({ comp_code: 1, cust_code: 1 }, { unique: true });

const CustMast = mongoose.model("CustMast", custMastSchema);

export default CustMast;
