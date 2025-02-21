import mongoose from "mongoose";

const custMastSchema = new mongoose.Schema(
  {
    comp_code: { type: Number, required: true },
    cust_code: { type: Number, required: true },
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
