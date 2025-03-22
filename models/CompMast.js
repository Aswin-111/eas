import mongoose from "mongoose";

const CompMastSchema = new mongoose.Schema({
  comp_code: { type: String, required: true },
  comp_name: { type: String, required: true },
  comp_address_one: { type: String, required: true },
  comp_address_two: { type: String, required: true },
  comp_phone: { type: String, required: true },
  comp_email: { type: String, required: true },
  comp_gst_num: { type: String, required: true },
  price_inc: { type: Boolean, required: true },
  gst_type: { type: String, required: true },
  prefix: { type: String, required: true },
  suffix: { type: String, required: true },

  inv_msgs: { type: String, required: true },
  fin_year: { type: String, required: true },




  
});

export default mongoose.model("CompMast", CompMastSchema);
