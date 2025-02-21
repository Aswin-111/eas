const mongoose = require('mongoose');

const ordMastSchema = new mongoose.Schema({
  comp_code: { type: String, required: true },
  ord_no: { type: Number, required: true },
  ord_date: { type: String },
  ord_time: { type: String },
  act_code: { type: String },
  act_name: { type: String },
  act_address: { type: String },
  act_phone: { type: String },
  act_area: { type: String },
  act_type: { type: String },
  trx_disc: { type: Number },
  trx_total: { type: Number },
  trx_netamount: { type: Number },
  status_flag: { type: String, default: 'N' },
  user_code: { type: String },
  user_name: { type: String },
  lat_long: { type: String },
  system_name: { type: String }
}, {
  timestamps: true
});

ordMastSchema.index({ comp_code: 1, ord_no: 1 }, { unique: true });

const OrdMast = mongoose.model('OrdMast', ordMastSchema);

module.exports = OrdMast;
