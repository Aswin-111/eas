const mongoose = require('mongoose');

const ordTrxfileSchema = new mongoose.Schema({
  comp_code: { type: String, required: true },
  ord_no: { type: Number, required: true },
  line_no: { type: Number, required: true, autoIncrement: true },
  ord_date: { type: String },
  item_code: { type: String },
  item_name: { type: String },
  item_qty: { type: Number },
  item_mrp: { type: Number },
  item_price: { type: Number },
  item_tax: { type: Number },
  item_disc: { type: Number },
  item_cess: { type: Number },
  trx_total: { type: Number },
  status_flag: { type: String }
}, {
  timestamps: true
});

ordTrxfileSchema.index({ comp_code: 1, ord_no: 1, line_no: 1 }, { unique: true });

const OrdTrxfile = mongoose.model('OrdTrxfile', ordTrxfileSchema);

module.exports = OrdTrxfile;
