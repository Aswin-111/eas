import mongoose from "mongoose";

const itemMastMongoSchema = new mongoose.Schema(
  {
    comp_code: {
      type: String,
      required: true,
      trim: true,
    },

    item_code: {
      type: String,
      required: true,
      trim: true,
    },

    item_name: {
      type: String,
      default: "",
      trim: true,
    },

    item_qty: {
      type: Number,
      default: 0,
    },

    item_price1: {
      type: Number,
      default: 0,
    },

    item_price2: {
      type: Number,
      default: 0,
    },

    item_price3: {
      type: Number,
      default: 0,
    },

    item_price4: {
      type: Number,
      default: 0,
    },

    item_price5: {
      type: Number,
      default: 0,
    },

    item_mrp: {
      type: Number,
      default: 0,
    },

    item_cost: {
      type: Number,
      default: 0,
    },

    item_netcost: {
      type: Number,
      default: 0,
    },

    item_tax: {
      type: Number,
      default: 0,
    },

    item_disc: {
      type: Number,
      default: 0,
    },

    item_cess: {
      type: Number,
      default: 0,
    },

    hsn_code: {
      type: String,
      default: "",
      trim: true,
    },

    item_uom: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

itemMastMongoSchema.index(
  {
    comp_code: 1,
    item_code: 1,
  },
  {
    unique: true,
    name: "unique_company_item_code",
  }
);

const ItemMast =
  mongoose.models.ItemMast ||
  mongoose.model("ItemMast", itemMastMongoSchema);

export default ItemMast;