import mongoose from "mongoose";

const itemMastSchema = new mongoose.Schema(
  {
    comp_code: { type: String, required: true },
    item_code: { type: String },
    item_name: { type: String },
    item_qty: { type: Number },
    item_price1: { type: Number },
    item_price2: { type: Number },
    item_price3: { type: Number },
    item_price4: { type: Number },
    item_price5: { type: Number },
    item_mrp: { type: Number },
    item_cost: { type: Number },
    item_netcost: { type: Number },
    item_tax: { type: Number },
    item_disc: { type: Number },
    item_cess: { type: Number },
    hsn_code: { type: String },
    item_uom: { type: String },
  },
  {
    timestamps: true,
  }
);

const ItemMast = mongoose.model("ItemMast", itemMastSchema);

export default ItemMast;
