import mongoose from "mongoose";
import { z } from "zod";
import CustMast from "../models/CustMast.js"; // Assuming you have a models directory for database operations

import ItemMast from "../models/ItemMast.js";

import OrdMast from "../models/OrdMast.js";
import OrdTrxfile from "../models/OrdTrxfile.js";

import CompMast from "../models/CompMast.js";

import UserMast from "../models/UserMast.js";
import puppeteer from "puppeteer";
import PDFDocument from "pdfkit";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import { enqueueItemSyncBatch, getBatchStatus } from "../queues/itemSyncQueue.js";

// ==========================================
// ✅ ADD THESE SCHEMAS & HELPERS
// ==========================================
const round2 = (value) => {
  const num = Number(value || 0);
  return Math.round((num + Number.EPSILON) * 100) / 100;
};
const formatZodError = (error) => {
  return error.errors.map((e) => ({
    field: e.path.join("."),
    message: e.message,
  }));
};

// 1. Item Master Schema
const itemMastSchema = z.array(
  z.object({
    comp_code: z.string().min(1, "comp_code is required"),
    item_code: z.string().min(1, "item_code is required"), // Key for matching
    item_name: z.string().optional(),
    // .passthrough() allows other DB fields to pass through
  }).catchall(z.any())
);

// 2. Customer Master Schema
const custMastSchema = z.array(
  z.object({
    comp_code: z.string().min(1, "comp_code is required"),
    cust_code: z.string().min(1, "cust_code is required"), // Key for matching
    cust_name: z.string().optional(),
  }).catchall(z.any())
);

// 3. User Master Schema
const userMastSchema = z.array(
  z.object({
    comp_code: z.string().min(1, "comp_code is required"),
    user_id: z.string().min(1, "user_id is required"), // Key for matching
    user_name: z.string().optional(),
    user_password: z.string().optional(),
  }).catchall(z.any())
);
// Add near the top of controllers/cust.controller.js, with the other imports:
 
// Small helper used by getAllShopDetails for safe regex search (was referenced
// but never defined in the original file).
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
 
async function getLatestCustNumber(comp_code) {
  const comp = String(comp_code);

  const result = await CustMast.aggregate([
    { $match: { comp_code: comp } },

    // extract starting digits from cust_code
    {
      $addFields: {
        cust_num_str: {
          $getField: {
            field: "match",
            input: {
              $regexFind: { input: "$cust_code", regex: /^[0-9]+/ },
            },
          },
        },
      },
    },

    // convert to int (if no match -> null)
    {
      $addFields: {
        cust_num: {
          $cond: [
            { $ifNull: ["$cust_num_str", false] },
            { $toInt: "$cust_num_str" },
            null,
          ],
        },
      },
    },

    { $match: { cust_num: { $ne: null } } },
    { $sort: { cust_num: -1 } },
    { $limit: 1 },
    { $project: { cust_num: 1 } },
  ]);

  return result.length ? result[0].cust_num : 0;
}

const toNum = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const custController = {
  getAllUsers: async (req, res) => {
    try {

      const users = await UserMast.find({})
        .select("-user_password")
        .sort({ user_name: 1 });

      return res.status(200).json({
        message: "Users fetched successfully",
        count: users.length,
        data: users,
      });
    } catch (error) {
      console.error("getAllUsers error:", error);
      return res.status(500).json({
        message: "Internal Server Error",
        error: error.message,
      });
    }
  },
  getAllCust: async (req, res) => {
    try {
      const comp_code = req.comp_code;

      const pageNum = Math.max(Number(req.query.page || 1), 1);
      const limitNum = Math.max(Number(req.query.limit || 10), 1);
      const skip = (pageNum - 1) * limitNum;
      const area = req.query.area?.trim();
      const name = req.query.name?.trim();
      const compStr = String(comp_code).trim();
      const compNum = Number(comp_code);

      const compVariants = Number.isNaN(compNum)
        ? [compStr]
        : [compStr, String(compNum)];

      const query = {
        comp_code: { $in: compVariants },
        ...(area ? { cust_area: area } : {}),
        ...(name ? { cust_name: { $regex: name, $options: "i" } } : {}),
      };

      const totalMatching = await CustMast.countDocuments(query);

      const customers = await CustMast.find(query)
        .collation({ locale: "en", strength: 2 }) // case-insensitive alphabetical sort
        .sort({ cust_name: 1 }) // shop name alphabetical order
        .skip(skip)
        .limit(limitNum)
        .lean();

      const areas = await CustMast.distinct("cust_area", query);

      return res.status(200).json({
        users: customers.map((customer) => ({
          cust_code: customer.cust_code,
          cust_name: customer.cust_name,
          cust_phone: customer.cust_phone || "N/A",
          cust_address: customer.cust_address || "N/A",
          cust_area: customer.cust_area || "N/A",
          cust_type: customer.cust_type || "R",
          cust_gst: customer.cust_gst || "N/A",
          old_bal: customer.Old_bal ?? 0,
        })),
        areas: areas.filter(Boolean).sort((a, b) => a.localeCompare(b)),
        total: totalMatching,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalMatching / limitNum),
      });
    } catch (error) {
      console.error("getAllCust error:", error);
      return res.status(500).json({
        message: "Internal server error",
        error: error.message,
      });
    }
  },


// Replace the existing `getAllShopDetails: async (req, res) => { ... }`
// method with this paginated version.

getAllShopDetails: async (req, res) => {
  try {
    const comp_code = String(req.comp_code ?? "").trim();
    const search = String(
      req.body?.search ?? req.query?.search ?? ""
    ).trim();

    if (!comp_code) {
      return res.status(400).json({
        message: "Company code is missing",
      });
    }

    // ✅ Pagination params (same convention as getAllCust)
    const pageNum = Math.max(Number(req.body?.page ?? req.query?.page ?? 1), 1);
    const limitNum = Math.max(Number(req.body?.limit ?? req.query?.limit ?? 20), 1);
    const skip = (pageNum - 1) * limitNum;

    const query = {
      comp_code,
    };

    if (search) {
      const safeSearch = escapeRegex(search);

      query.$or = [
        {
          item_code: {
            $regex: safeSearch,
            $options: "i",
          },
        },
        {
          item_name: {
            $regex: safeSearch,
            $options: "i",
          },
        },
      ];
    }

    const [shopDetails, total] = await Promise.all([
      ItemMast.find(query)
        .sort({
          item_name: 1,
          item_code: 1,
        })
        .skip(skip)
        .limit(limitNum)
        .lean(),

      ItemMast.countDocuments(query),
    ]);

    return res.status(200).json({
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      data: shopDetails,
    });
  } catch (error) {
    console.error("getAllShopDetails error:", error);

    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
},



  addCustDetails: async (req, res) => {
    try {
      const customers = req.body.customers; // Expecting an array of customers
      if (!Array.isArray(customers) || customers.length === 0) {
        return res
          .status(400)
          .json({ message: "Invalid input, expecting an array of customers." });
      }

      const createdCustomers = await CustMast.insertMany(customers);
      res.status(201).json({
        message: "Customers created successfully",
        data: createdCustomers,
      });
    } catch (error) {
      res
        .status(500)
        .json({ message: "Error creating customers", error: error.message });
    }
  },

  addItemDetails: async (req, res) => {
    try {
      const items = req.body.items;
      if (!Array.isArray(items) || items.length === 0) {
        return res
          .status(400)
          .json({ message: "Invalid input, expecting an array of items." });
      }
      const createdItems = await ItemMast.insertMany(items);
      res
        .status(201)
        .json({ message: "Items created successfully", data: createdItems });
    } catch (error) {
      res
        .status(500)
        .json({ message: "Error creating items", error: error.message });
    }
  },
  addCompanies: async (req, res) => {
    try {
      if (!Array.isArray(req.body)) {
        return res.status(400).json({
          message: "Request body must be an array of company objects.",
        });
      }

      const companies = req.body;

      // Validate each company object against the schema
      for (const company of companies) {
        const {
          comp_code,
          comp_name,
          comp_address_one,
          comp_address_two,
          comp_phone,
          comp_email,
          comp_gst_num,
          price_inc,
          gst_type,
          prefix,
          suffix,
          inv_msgs,
          fin_year,
        } = company;

        if (
          !comp_code ||
          !comp_name ||
          !comp_address_one ||
          !comp_address_two ||
          !comp_phone ||
          !comp_email ||
          !comp_gst_num ||
          price_inc === undefined ||
          !gst_type ||
          !prefix ||
          !suffix ||
          !inv_msgs ||
          !fin_year
        ) {
          return res.status(400).json({
            message:
              "One or more required fields are missing in a company object.",
          });
        }

        // Additional validation if needed (e.g., email format, phone number format)
      }

      // Bulk insert the companies
      const insertedCompanies = await CompMast.insertMany(companies);

      res.status(201).json({
        message: "Companies created successfully",
        data: insertedCompanies,
      });
    } catch (error) {
      console.error("Error creating companies:", error);
      if (error instanceof mongoose.Error.ValidationError) {
        // Handle Mongoose validation errors
        const validationErrors = {};
        for (const field in error.errors) {
          validationErrors[field] = error.errors[field].message;
        }
        return res
          .status(400)
          .json({ message: "Validation error", errors: validationErrors });
      }
      res
        .status(500)
        .json({ message: "Internal server error", error: error.message });
    }
  },

  addUsers: async (req, res) => {
    try {
      if (!Array.isArray(req.body)) {
        return res
          .status(400)
          .json({ message: "Request body must be an array of user objects." });
      }

      const users = req.body;

      // Validate each user object
      for (const user of users) {
        const { comp_code, user_id, user_name, user_password } = user;

        if (!comp_code || !user_id || !user_name) {
          return res.status(400).json({
            message: "One or more required fields are missing in a user object.",
          });
        }

        // enforce password presence for new users
        if (!user_password || String(user_password).trim().length < 4) {
          return res.status(400).json({
            message: `Password is required (min 4 chars) for user_id: ${user_id}`,
          });
        }
      }

      // Hash passwords
      const SALT_ROUNDS = 10;

      const usersToInsert = await Promise.all(
        users.map(async (u) => {
          const hashed = await bcrypt.hash(String(u.user_password), SALT_ROUNDS);
          return {
            ...u,
            user_password: hashed,
          };
        })
      );

      const insertedUsers = await UserMast.insertMany(usersToInsert);

      return res.status(201).json({
        message: "Users created successfully",
        data: insertedUsers,
      });
    } catch (error) {
      console.error("Error creating users:", error);

      if (error instanceof mongoose.Error.ValidationError) {
        const validationErrors = {};
        for (const field in error.errors) {
          validationErrors[field] = error.errors[field].message;
        }
        return res
          .status(400)
          .json({ message: "Validation error", errors: validationErrors });
      }

      if (error.code === 11000) {
        return res
          .status(400)
          .json({ message: "Duplicate comp_code and user_id combination." });
      }

      return res
        .status(500)
        .json({ message: "Internal server error", error: error.message });
    }
  },
  createCustomer: async (req, res) => {
    try {
      const {

        cust_name,
        cust_address,
        cust_phone,
        cust_area,
        cust_type,
        cust_gst,
        Old_bal,
      } = req.body;
      const comp_code = req.comp_code;
      if (!cust_name) {
        return res.status(400).json({ message: "cust_name is required" });
      }

      const latest = await getLatestCustNumber(comp_code);
      const next = latest + 1;

      // ✅ online code = number + *
      const newCustCode = `${next}*`;

      const created = await CustMast.create({
        comp_code: String(comp_code),
        cust_code: newCustCode,
        cust_name,
        cust_address,
        cust_phone,
        cust_area,
        cust_type: cust_type || "R",
        cust_gst,
        Old_bal,
      });

      return res.status(201).json({
        message: "Customer created successfully",
        data: created,
      });
    } catch (error) {
      if (error?.code === 11000) {
        return res.status(409).json({
          message: "cust_code conflict. Retry creating customer.",
        });
      }

      return res.status(500).json({ message: "Internal server error", error: error.message });
    }
  },
  getOrderReports: async (req, res) => {
    try {
      const comp_code = String(req.comp_code || "").trim();
      const user_code = String(req.user?.user_id || "").trim();

      if (!comp_code || !user_code) {
        return res.status(401).json({ message: "Invalid token context" });
      }

      const pageNum = Math.max(Number(req.query.page || 1), 1);
      const limitNum = Math.max(Number(req.query.limit || 10), 1);
      const skip = (pageNum - 1) * limitNum;

      const from = req.query.from ? String(req.query.from).trim() : null;
      const to = req.query.to ? String(req.query.to).trim() : null;

      const statusRaw = req.query.status ? String(req.query.status).trim() : null;
      const pendingFlag = String(req.query.pending || "").toLowerCase() === "true";
      const billedFlag = String(req.query.billed || "").toLowerCase() === "true";

      let statuses = [];

      if (statusRaw) {
        statuses = statusRaw
          .split(",")
          .map((s) => s.trim().toUpperCase())
          .filter((s) => s === "N" || s === "Y");
      } else {
        if (pendingFlag) statuses.push("N");
        if (billedFlag) statuses.push("Y");
      }

      const matchQuery = {
        comp_code,
        user_code,
      };

      if (from && to) {
        matchQuery.ord_date = { $gte: from, $lte: to };
      } else if (from) {
        matchQuery.ord_date = { $gte: from };
      } else if (to) {
        matchQuery.ord_date = { $lte: to };
      }

      if (statuses.length === 1) {
        matchQuery.status_flag = statuses[0];
      } else if (statuses.length > 1) {
        matchQuery.status_flag = { $in: statuses };
      }

      const orders = await OrdMast.aggregate([
        { $match: matchQuery },

        {
          $lookup: {
            from: "custmasts",
            let: {
              compCode: "$comp_code",
              actCode: { $toString: "$act_code" },
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$comp_code", "$$compCode"] },
                      { $eq: [{ $toString: "$cust_code" }, "$$actCode"] },
                    ],
                  },
                },
              },
              {
                $project: {
                  _id: 0,
                  cust_name: 1,
                  cust_phone: 1,
                  cust_address: 1,
                  cust_area: 1,
                  cust_type: 1,
                },
              },
            ],
            as: "customer",
          },
        },

        {
          $addFields: {
            cust_name: {
              $let: {
                vars: {
                  lookupName: { $arrayElemAt: ["$customer.cust_name", 0] },
                  orderName: "$act_name",
                },
                in: {
                  $cond: [
                    {
                      $and: [
                        { $ne: ["$$lookupName", null] },
                        { $ne: [{ $trim: { input: "$$lookupName" } }, ""] },
                      ],
                    },
                    "$$lookupName",
                    {
                      $cond: [
                        {
                          $and: [
                            { $ne: ["$$orderName", null] },
                            { $ne: [{ $trim: { input: "$$orderName" } }, ""] },
                          ],
                        },
                        "$$orderName",
                        "-",
                      ],
                    },
                  ],
                },
              },
            },
            cust_phone: {
              $ifNull: [
                { $arrayElemAt: ["$customer.cust_phone", 0] },
                { $ifNull: ["$act_phone", ""] },
              ],
            },
            cust_address: {
              $ifNull: [
                { $arrayElemAt: ["$customer.cust_address", 0] },
                { $ifNull: ["$act_address", ""] },
              ],
            },
            cust_area: {
              $ifNull: [
                { $arrayElemAt: ["$customer.cust_area", 0] },
                { $ifNull: ["$act_area", ""] },
              ],
            },
            cust_type: {
              $ifNull: [
                { $arrayElemAt: ["$customer.cust_type", 0] },
                { $ifNull: ["$act_type", ""] },
              ],
            },
          },
        },

        {
          $project: {
            customer: 0,
          },
        },

        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limitNum },
      ]);

      const total = await OrdMast.countDocuments(matchQuery);

      const totalsAgg = await OrdMast.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: null,
            sum_trx_total: { $sum: { $ifNull: ["$trx_total", 0] } },
            sum_trx_netamount: { $sum: { $ifNull: ["$trx_netamount", 0] } },
            count: { $sum: 1 },
          },
        },
      ]);

      const totals = totalsAgg.length
        ? {
          trx_total: totalsAgg[0].sum_trx_total,
          trx_netamount: totalsAgg[0].sum_trx_netamount,
          count: totalsAgg[0].count,
        }
        : {
          trx_total: 0,
          trx_netamount: 0,
          count: 0,
        };

      return res.status(200).json({
        filters: {
          from,
          to,
          statuses: statuses.length ? statuses : "ALL",
        },
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
        subtotal: totals,
        data: orders,
      });
    } catch (error) {
      console.error("getOrderReports error:", error);
      return res.status(500).json({
        message: "Internal server error",
        error: error.message,
      });
    }
  },

  getOrderDetails: async (req, res) => {
    try {
      const comp_code = String(req.comp_code || "").trim();
      const user_code = String(req.user?.user_id || "").trim();
      const ord_no = Number(req.params.ord_no);

      if (!comp_code || !ord_no) {
        return res.status(400).json({
          message: "comp_code and ord_no are required",
        });
      }

      // 1) Fetch order master
      const order = await OrdMast.findOne({
        comp_code,
        ord_no,
        user_code,
      }).lean();

      if (!order) {
        return res.status(404).json({
          message: "Order not found",
        });
      }

      // 2) Fetch order line items
      const items = await OrdTrxfile.find({
        comp_code,
        ord_no,
      })
        .sort({ line_no: 1 })
        .lean();

      // 3) Build customer data from order first
      let customerData = {
        code: order.act_code || "",
        name: order.act_name || "",
        phone: order.act_phone || "",
        address: order.act_address || "",
        area: order.act_area || "",
        type: order.act_type || "",
      };

      // 4) If order does not store customer details, fallback to CustMast
      const hasMissingCustomerDetails =
        !String(customerData.name || "").trim() &&
        !String(customerData.phone || "").trim() &&
        !String(customerData.address || "").trim() &&
        !!String(customerData.code || "").trim();

      if (hasMissingCustomerDetails) {
        const rawActCode = String(order.act_code || "").trim();

        let cust = null;

        // try direct code first: "1"
        cust = await CustMast.findOne({
          comp_code,
          cust_code: rawActCode,
        }).lean();

        // optional fallback: if customer codes are stored like 1001, 1002...
        if (!cust) {
          const actCodeNum = Number(rawActCode);
          if (!Number.isNaN(actCodeNum)) {
            cust = await CustMast.findOne({
              comp_code,
              cust_code: String(1000 + actCodeNum),
            }).lean();
          }
        }

        if (cust) {
          customerData = {
            code: rawActCode,
            name: cust.cust_name || "",
            phone: cust.cust_phone || "",
            address: cust.cust_address || "",
            area: cust.cust_area || "",
            type: cust.cust_type || "",
          };
        }
      }

      // 5) Recalculate summary from order items
      const summary = items.reduce(
        (acc, item) => {
          acc.total_qty += Number(item.item_qty || 0);
          acc.subtotal += Number(item.trx_total || 0);
          acc.tax += Number(item.item_tax || 0);
          acc.discount += Number(item.item_disc || 0);
          return acc;
        },
        {
          total_qty: 0,
          subtotal: 0,
          tax: 0,
          discount: 0,
        }
      );

      // 6) Return response
      return res.status(200).json({
        order: {
          ord_no: order.ord_no,
          ord_date: order.ord_date,
          ord_time: order.ord_time,
          status: order.status_flag === "Y" ? "BILLED" : "PENDING",
          customer: customerData,
          totals: {
            trx_total: Number(order.trx_total || 0),
            trx_netamount: Number(order.trx_netamount || 0),
          },
        },

        items: items.map((item) => ({
          line_no: item.line_no,
          item_code: item.item_code || "",
          item_name: item.item_name || "",
          qty: Number(item.item_qty || 0),
          mrp: Number(item.item_mrp || 0),
          price: Number(item.item_price || 0),
          tax: Number(item.item_tax || 0),
          discount: Number(item.item_disc || 0),
          cess: Number(item.item_cess || 0),
          total: Number(item.trx_total || 0),
        })),

        computed_summary: {
          total_qty: Number(summary.total_qty || 0),
          subtotal: Number(summary.subtotal || 0),
          tax: Number(summary.tax || 0),
          discount: Number(summary.discount || 0),
        },
      });
    } catch (error) {
      console.error("getOrderDetails error:", error);
      return res.status(500).json({
        message: "Internal server error",
        error: error.message,
      });
    }
  },




  // orders: async (req, res) => {
  //   try {
  //     const { comp_code, user_id, order_details } = req.body;

  //     // 1. Generate Order Number
  //     const lastOrder = await OrdMast.findOne({ comp_code })
  //       .sort({ ord_no: -1 })
  //       .lean();

  //     const ord_no = lastOrder ? lastOrder.ord_no + 1 : 1;

  //     // 2. Calculate Total Amount
  //     const totalAmount = order_details.reduce(
  //       (sum, item) => sum + item.subtotal,
  //       0
  //     );

  //     // 3. Create Order Master
  //     const ordMast = new OrdMast({
  //       comp_code,
  //       ord_no,
  //       ord_date: new Date().toISOString().split("T")[0],
  //       ord_time: new Date().toTimeString().split(" ")[0],
  //       act_code: user_id,
  //       trx_total: totalAmount,
  //       trx_netamount: totalAmount,
  //       user_code: user_id,
  //       status_flag: "N",
  //     });

  //     // 4. Create Transaction Items
  //     const trxItems = order_details.map(
  //       (item, index) =>
  //         new OrdTrxfile({
  //           comp_code,
  //           ord_no,
  //           line_no: index + 1,
  //           ord_date: new Date().toISOString().split("T")[0],
  //           item_name: item.item_name,
  //           item_qty: item.qty,
  //           item_mrp: item.item_mrp,
  //           item_price: item.item_price1,
  //           item_tax: item.item_tax,
  //           item_disc: item.discount,
  //           trx_total: item.subtotal,
  //           status_flag: "N",
  //         })
  //     );

  //     // 5. Save Everything without transactions
  //     await ordMast.save();
  //     await OrdTrxfile.insertMany(trxItems);

  //     // 6. Generate HTML Bill
  //     const htmlBill = generateHTMLBill(comp_code, ord_no, ordMast, trxItems);

  //     // 7. Send response with order details and HTML bill
  //     res.status(201).json({
  //       message: "Order successfully placed",
  //       ord_no,
  //       total: totalAmount,
  //       bill_html: htmlBill, // Send the HTML bill
  //     });
  //   } catch (error) {
  //     console.error("Order Error:", error);
  //     res.status(500).json({
  //       message: "Order failed",
  //       error: error.message,
  //     });
  //   }
  // },

  orders: async (req, res) => {
    try {
      const { order_details, customer } = req.body;

      const comp_code = String(req.comp_code || "").trim();
      const user_id = String(req.user?.user_id || "").trim();

      if (!comp_code || !user_id) {
        return res.status(401).json({
          message: "Invalid token context",
        });
      }

      if (!Array.isArray(order_details) || order_details.length === 0) {
        return res.status(400).json({
          message: "order_details is required",
        });
      }

      const lastOrder = await OrdMast.findOne({ comp_code })
        .sort({ ord_no: -1 })
        .lean();

      const ord_no = lastOrder ? lastOrder.ord_no + 1 : 1;

      const totalAmount = order_details.reduce(
        (sum, item) => sum + Number(item.subtotal || 0),
        0
      );

      const today = new Date().toISOString().split("T")[0];
      const nowTime = new Date().toTimeString().split(" ")[0];

      const ordMast = new OrdMast({
        comp_code,
        ord_no,
        ord_date: today,
        ord_time: nowTime,

        // customer details
        act_code: String(customer?.code || "").trim(),
        act_name: String(customer?.name || "").trim(),
        act_phone: String(customer?.phone || "").trim(),
        act_address: String(customer?.address || "").trim(),
        act_area: String(customer?.area || "").trim(),
        act_type: String(customer?.type || "").trim(),

        trx_total: totalAmount,
        trx_netamount: totalAmount,

        // logged in app user
        user_code: user_id,
        status_flag: "N",
      });

      const trxItems = order_details.map(
        (item, index) =>
          new OrdTrxfile({
            comp_code,
            ord_no,
            line_no: index + 1,
            ord_date: today,
            item_code: item.item_code,
            item_name: item.item_name,
            item_qty: Number(item.qty || 0),
            item_mrp: Number(item.item_mrp ?? item.mrp ?? 0),
            item_price: Number(item.item_price1 ?? item.price ?? 0),
            item_tax: Number(item.item_tax ?? item.tax ?? 0),
            item_disc: Number(item.item_disc ?? item.discount ?? 0),
            item_cess: Number(item.item_cess ?? item.cess ?? 0),
            trx_total: Number(item.subtotal || 0),
            status_flag: "N",
          })
      );

      await ordMast.save();
      await OrdTrxfile.insertMany(trxItems);

      let pdfBuffer;
      let renderer;
      try {
        ({ pdfBuffer, renderer } = await generateBillPdf(
          comp_code,
          ord_no,
          ordMast,
          trxItems
        ));
      } catch (pdfErr) {
        // Both Chrome and PDFKit failed. The order IS saved - say so,
        // so nobody re-submits it.
        console.error(`Bill PDF failed for order ${ord_no}:`, pdfErr);
        return res.status(500).json({
          message: `Order #${ord_no} was saved, but the bill PDF could not be generated. Do not submit again.`,
          ord_no,
          order_saved: true,
          error: pdfErr.message,
        });
      }

      res.set("X-Bill-Renderer", renderer); // "chrome" or "pdfkit"
      res.set(
        "Content-Disposition",
        `attachment; filename="bill_${ord_no}.pdf"`
      );
      res.set("Content-Type", "application/pdf");
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Order Error:", error);
      res.status(500).json({
        message: "Order failed",
        error: error.message,
      });
    }
  },
  deleteCompMast: async (req, res) => {
    try {
      const compCode = req.body.comp_code; // Get comp_code from request body

      if (!compCode) {
        return res
          .status(400)
          .json({ message: "comp_code is required in the request body." });
      }

      const result = await CompMast.deleteMany({ comp_code: compCode });

      if (result.deletedCount > 0) {
        res.status(200).json({
          message: `Successfully deleted ${result.deletedCount} company records with comp_code: ${compCode}.`,
          deletedCount: result.deletedCount,
        });
      } else {
        res.status(404).json({
          message: `No company records found with comp_code: ${compCode}.`,
        });
      }
    } catch (error) {
      console.error("Error deleting company records:", error);
      res
        .status(500)
        .json({ message: "Internal server error", error: error.message });
    }
  },
  deleteItemMast: async (req, res) => {
    try {
      const compCode = req.body.comp_code; // Get comp_code from request body

      if (!compCode) {
        return res
          .status(400)
          .json({ message: "comp_code is required in the request body." });
      }

      const result = await ItemMast.deleteMany({ comp_code: compCode });

      if (result.deletedCount > 0) {
        res.status(200).json({
          message: `Successfully deleted ${result.deletedCount} item mast  with comp_code: ${compCode}.`,
          deletedCount: result.deletedCount,
        });
      } else {
        res.status(404).json({
          message: `item mast records not found with comp_code: ${compCode}.`,
        });
      }
    } catch (error) {
      console.error("Error deleting company records:", error);
      res
        .status(500)
        .json({ message: "Internal server error", error: error.message });
    }
  },
  deleteUserMast: async (req, res) => {
    try {
      const compCode = req.body.comp_code; // Get comp_code from request body

      if (!compCode) {
        return res
          .status(400)
          .json({ message: "comp_code is required in the request body." });
      }

      const result = await UserMast.deleteMany({ comp_code: compCode });

      if (result.deletedCount > 0) {
        res.status(200).json({
          message: `Successfully deleted ${result.deletedCount} user mast records with comp_code: ${compCode}.`,
          deletedCount: result.deletedCount,
        });
      } else {
        res.status(404).json({
          message: `usermast records not found with comp_code: ${compCode}.`,
        });
      }
    } catch (error) {
      console.error("Error deleting user records:", error);
      res
        .status(500)
        .json({ message: "Internal server error", error: error.message });
    }
  },
  deleteCustMast: async (req, res) => {
    try {
      const compCode = req.body.comp_code; // Get comp_code from request body

      if (!compCode) {
        return res
          .status(400)
          .json({ message: "comp_code is required in the request body." });
      }

      const result = await CustMast.deleteMany({ comp_code: compCode });

      if (result.deletedCount > 0) {
        res.status(200).json({
          message: `Successfully deleted ${result.deletedCount} custmast records with comp_code: ${compCode}.`,
          deletedCount: result.deletedCount,
        });
      } else {
        res.status(404).json({
          message: `custmast records found with comp_code: ${compCode}.`,
        });
      }
    } catch (error) {
      console.error("Error deleting custmast records:", error);
      res
        .status(500)
        .json({ message: "Internal server error", error: error.message });
    }
  },

// Replace the existing `syncItemMast: async (req, res) => { ... }` method
// inside the custController object with this version.

  syncItemMast: async (req, res) => {
    try {
      const validation = itemMastSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          message: "Validation failed",
          errors: formatZodError(validation.error),
        });
      }

      const receivedItems = validation.data;

      if (!Array.isArray(receivedItems) || receivedItems.length === 0) {
        return res.status(200).json({ message: "No items to sync" });
      }

      const normalizedItems = [];
      const invalidItems = [];
      const duplicateCheck = new Map();

      console.log("Total items sync itemmast:", receivedItems?.length);

      receivedItems.forEach((item, index) => {
        const comp_code = String(item.comp_code ?? req.comp_code ?? "").trim();
        let item_code = String(item.item_code ?? "").trim();

        if (!comp_code || !item_code) {
          invalidItems.push({ index, comp_code, item_code, reason: "missing key fields" });
          return;
        }

        item_code = item_code.replace(/\s+/g, "");
        const key = `${comp_code}::${item_code}`;

        if (duplicateCheck.has(key)) {
          console.warn(`Duplicate item_code ${item_code} for comp ${comp_code}`);
        }
        duplicateCheck.set(key, true);

        normalizedItems.push({
          ...item,
          comp_code,
          item_code,
        });
      });

      if (invalidItems.length > 0) {
        console.warn(`${invalidItems.length} invalid items skipped`);
      }

      if (normalizedItems.length === 0) {
        return res.status(200).json({
          message: "No valid items to sync",
          details: { received: receivedItems.length, invalid: invalidItems.length },
        });
      }

      const compCodesInBatch = [...new Set(normalizedItems.map((i) => i.comp_code))];

      // Instead of running ItemMast.bulkWrite() synchronously in-request
      // (which risks hitting Mongo's per-operation / payload limits on huge
      // uploads), split into chunks and hand off to a Redis-backed queue
      // (BullMQ). The worker process (workers/itemSyncWorker.js) consumes
      // these chunk jobs and performs the actual bulkWrite calls.
      const { batch_id, total_chunks, total_items } = await enqueueItemSyncBatch(
        normalizedItems,
        { comp_codes: compCodesInBatch }
      );

      return res.status(202).json({
        message: "Item Master sync queued successfully",
        batch_id,
        details: {
          received: receivedItems.length,
          queued: total_items,
          invalid: invalidItems.length,
          total_chunks,
        },
        status_url: `/sync-status/${batch_id}`,
      });
    } catch (error) {
      console.error("syncItemMast error:", error);
      return res.status(500).json({
        message: "Internal Server Error",
        error: error.message,
        stack: error.stack,
      });
    }
  },

  // ------------------------------------------
  // ✅ NEW: Poll batch status for a queued item sync
  // ------------------------------------------
  getSyncStatus: async (req, res) => {
    try {
      const { batch_id } = req.params;

      if (!batch_id) {
        return res.status(400).json({ message: "batch_id is required" });
      }

      const status = await getBatchStatus(batch_id);

      if (!status) {
        return res.status(404).json({
          message: "Batch not found or expired",
          batch_id,
        });
      }

      return res.status(200).json(status);
    } catch (error) {
      console.error("getSyncStatus error:", error);
      return res.status(500).json({
        message: "Internal server error",
        error: error.message,
      });
    }
  },

  // ------------------------------------------
  // ✅ NEW: Sync Customer Master (Upsert)
  // Match: comp_code + cust_code
  // ------------------------------------------
  syncCustMast: async (req, res) => {
    try {
      const validation = custMastSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          message: "Validation Failed",
          errors: formatZodError(validation.error),
        });
      }

      const customers = validation.data;
      if (customers.length === 0) {
        return res.status(200).json({ message: "No customers to sync." });
      }

      // Match comp_code AND cust_code
      const bulkOps = customers.map((cust) => ({
        updateOne: {
          filter: {
            comp_code: String(cust.comp_code),
            cust_code: String(cust.cust_code),
          },
          update: { $set: cust },
          upsert: true,
        },
      }));

      const result = await CustMast.bulkWrite(bulkOps);

      return res.status(200).json({
        message: "Customer Master synced successfully",
        details: {
          matched: result.matchedCount,
          modified: result.modifiedCount,
          upserted: result.upsertedCount,
        },
      });
    } catch (error) {
      console.error("syncCustMast error:", error);
      return res
        .status(500)
        .json({ message: "Internal Server Error", error: error.message });
    }
  },

  // ------------------------------------------
  // ✅ NEW: Sync User Master (Upsert + Hash Password)
  // Match: comp_code + user_id
  // ------------------------------------------
  syncUserMast: async (req, res) => {
    try {
      const validation = userMastSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          message: "Validation Failed",
          errors: formatZodError(validation.error),
        });
      }

      const users = validation.data;
      if (users.length === 0) {
        return res.status(200).json({ message: "No users to sync." });
      }

      const SALT_ROUNDS = 10;

      // Prepare users (Hash password if needed)
      const processedUsers = await Promise.all(
        users.map(async (u) => {
          // If password exists and isn't already hashed (simple check for bcrypt start)
          if (u.user_password && !u.user_password.startsWith("$2")) {
            u.user_password = await bcrypt.hash(
              String(u.user_password),
              SALT_ROUNDS
            );
          }
          return u;
        })
      );

      // Match comp_code AND user_id
      const bulkOps = processedUsers.map((user) => ({
        updateOne: {
          filter: {
            comp_code: String(user.comp_code),
            user_id: String(user.user_id),
          },
          update: { $set: user },
          upsert: true,
        },
      }));

      const result = await UserMast.bulkWrite(bulkOps);

      return res.status(200).json({
        message: "User Master synced successfully",
        details: {
          matched: result.matchedCount,
          modified: result.modifiedCount,
          upserted: result.upsertedCount,
        },
      });
    } catch (error) {
      console.error("syncUserMast error:", error);
      return res
        .status(500)
        .json({ message: "Internal Server Error", error: error.message });
    }
  },

  // ------------------------------------------
  // ✅ Get All Pending Orders (Status = "N")
  // ------------------------------------------
  getPendingOrders: async (req, res) => {
    try {
      const comp_code = req.comp_code; // From auth middleware

      // Find orders matching comp_code AND status_flag "N"
      const pendingOrders = await OrdMast.find({
        comp_code: String(comp_code),
        status_flag: "N",
      }).sort({ ord_date: -1, ord_no: -1 }); // Sort by latest date/order number

      if (pendingOrders.length === 0) {
        return res.status(200).json({ message: "No pending orders found", data: [] });
      }

      return res.status(200).json({
        message: "Pending orders fetched successfully",
        count: pendingOrders.length,
        data: pendingOrders,
      });
    } catch (error) {
      console.error("getPendingOrders error:", error);
      return res.status(500).json({
        message: "Internal server error",
        error: error.message,
      });
    }
  },

  // ------------------------------------------
  // ✅ Update Order Status Flag
  // Matches: comp_code (from token) + ord_no (from body)
  // ------------------------------------------
  updateOrderStatus: async (req, res) => {
    try {
      const comp_code = req.comp_code; // From auth middleware
      const { ord_no, status_flag } = req.body;

      // 1. Validation
      if (!ord_no) {
        return res.status(400).json({ message: "ord_no is required" });
      }
      if (!status_flag) {
        return res.status(400).json({ message: "status_flag is required" });
      }

      // 2. Find and Update
      // We search by comp_code AND ord_no to ensure tenancy security
      const updatedOrder = await OrdMast.findOneAndUpdate(
        {
          comp_code: String(comp_code),
          ord_no: Number(ord_no)
        },
        {
          $set: { status_flag: String(status_flag) }
        },
        { new: true } // Return the updated document
      );

      if (!updatedOrder) {
        return res.status(404).json({
          message: `Order #${ord_no} not found for this company.`
        });
      }

      return res.status(200).json({
        message: "Order status updated successfully",
        data: {
          ord_no: updatedOrder.ord_no,
          new_status: updatedOrder.status_flag
        }
      });

    } catch (error) {
      console.error("updateOrderStatus error:", error);
      return res.status(500).json({
        message: "Internal server error",
        error: error.message,
      });
    }
  },
  pullOrderMast: async (req, res) => {
    try {
      const comp_code = String(req.query.comp_code || req.comp_code || "").trim();
      if (!comp_code) {
        return res.status(400).json({ message: "comp_code missing" });
      }

      const limitNum = Math.min(Number(req.query.limit || 1000), 5000);

      const last_id = req.query.last_id ? String(req.query.last_id).trim() : null;
      const updated_since = req.query.updated_since
        ? String(req.query.updated_since).trim()
        : null;

      const q = { comp_code };

      if (updated_since) {
        const dt = new Date(updated_since);
        if (Number.isNaN(dt.getTime())) {
          return res
            .status(400)
            .json({ message: "updated_since must be a valid date/ISO string" });
        }
        q.updatedAt = { $gt: dt };
      } else if (last_id) {
        if (!mongoose.Types.ObjectId.isValid(last_id)) {
          return res.status(400).json({ message: "last_id must be a valid ObjectId" });
        }
        q._id = { $gt: new mongoose.Types.ObjectId(last_id) };
      }

      const docs = await OrdMast.find(q)
        .sort(updated_since ? { updatedAt: 1, _id: 1 } : { _id: 1 })
        .limit(limitNum)
        .lean();

      if (!docs.length) {
        return res.status(200).json({
          data: [],
          next_last_id: "",
          next_updated_since: updated_since || "",
          count: 0,
        });
      }

      const ordNos = [...new Set(docs.map((d) => d.ord_no))];

      const trxDocs = await OrdTrxfile.find({
        comp_code,
        ord_no: { $in: ordNos },
      }).lean();

      const trxMap = new Map();
      for (const trx of trxDocs) {
        const key = `${trx.comp_code}__${trx.ord_no}`;
        if (!trxMap.has(key)) trxMap.set(key, []);
        trxMap.get(key).push(trx);
      }

      const enrichedDocs = docs.map((doc) => {
        const key = `${doc.comp_code}__${doc.ord_no}`;
        return {
          ...doc,
          trx_files: trxMap.get(key) || [],
        };
      });

      return res.status(200).json({
        data: enrichedDocs,
        next_last_id: docs.length ? String(docs[docs.length - 1]._id) : "",
        next_updated_since: docs.length
          ? docs[docs.length - 1].updatedAt
          : updated_since || "",
        count: enrichedDocs.length,
      });
    } catch (error) {
      console.error("pullOrderMast error:", error);
      return res
        .status(500)
        .json({ message: "Internal server error", error: error.message });
    }
  },

  pullOrderTrxfile: async (req, res) => {
    try {
      const comp_code = String(req.query.comp_code || req.comp_code || "").trim();
      if (!comp_code) {
        return res.status(400).json({ message: "comp_code missing" });
      }

      const limitNum = Math.min(Number(req.query.limit || 2000), 10000);

      const last_id = req.query.last_id ? String(req.query.last_id).trim() : null;
      const updated_since = req.query.updated_since
        ? String(req.query.updated_since).trim()
        : null;

      const q = { comp_code };

      if (updated_since) {
        const dt = new Date(updated_since);
        if (Number.isNaN(dt.getTime())) {
          return res
            .status(400)
            .json({ message: "updated_since must be a valid date/ISO string" });
        }
        q.updatedAt = { $gt: dt };
      } else if (last_id) {
        if (!mongoose.Types.ObjectId.isValid(last_id)) {
          return res.status(400).json({ message: "last_id must be a valid ObjectId" });
        }
        q._id = { $gt: new mongoose.Types.ObjectId(last_id) };
      }

      const docs = await OrdTrxfile.find(q)
        .sort(updated_since ? { updatedAt: 1, _id: 1 } : { _id: 1 })
        .limit(limitNum)
        .lean();

      if (!docs.length) {
        return res.status(200).json({
          data: [],
          next_last_id: "",
          next_updated_since: updated_since || "",
          count: 0,
        });
      }

      const ordNos = [...new Set(docs.map((d) => d.ord_no))];

      const mastDocs = await OrdMast.find({
        comp_code,
        ord_no: { $in: ordNos },
      }).lean();

      const mastMap = new Map();
      for (const mast of mastDocs) {
        const key = `${mast.comp_code}__${mast.ord_no}`;
        mastMap.set(key, mast);
      }

      const enrichedDocs = docs.map((doc) => {
        const key = `${doc.comp_code}__${doc.ord_no}`;
        return {
          ...doc,
          order_mast: mastMap.get(key) || null,
        };
      });

      return res.status(200).json({
        data: enrichedDocs,
        next_last_id: docs.length ? String(docs[docs.length - 1]._id) : "",
        next_updated_since: docs.length
          ? docs[docs.length - 1].updatedAt
          : updated_since || "",
        count: enrichedDocs.length,
      });
    } catch (error) {
      console.error("pullOrderTrxfile error:", error);
      return res
        .status(500)
        .json({ message: "Internal server error", error: error.message });
    }
  },

  updateOrderDetails: async (req, res) => {
    try {
      const comp_code = String(req.comp_code).trim();
      const user_code = String(req.user?.user_id || "").trim();
      const ord_no = Number(req.params.ord_no);

      if (!comp_code || !user_code || !ord_no) {
        return res.status(400).json({ message: "Invalid request context" });
      }

      const { customer, items, ord_date, ord_time, status_flag } = req.body || {};

      if (!Array.isArray(items) || items.length === 0) {
        return res
          .status(400)
          .json({ message: "At least one item is required" });
      }

      const existingOrder = await OrdMast.findOne({
        comp_code,
        ord_no,
        user_code,
      });

      if (!existingOrder) {
        return res.status(404).json({ message: "Order not found" });
      }

  

   

      const normalizedItems = items.map((item, index) => {
        const qty = toNum(item.qty, 0);
        const price = toNum(item.price, 0);
        const mrp = toNum(item.mrp, 0);
        const tax = toNum(item.tax, 0);
        const discount = toNum(item.discount, 0);
        const cess = toNum(item.cess, 0);

        const discountedBase = price - (price * discount) / 100;
        const lineTax = (discountedBase * tax) / 100;
        const lineCess = (discountedBase * cess) / 100;
        const lineTotal = round2((discountedBase + lineTax + lineCess) * qty);

        return {
          line_no: index + 1,
          item_code: String(item.item_code || "").trim(),
          item_name: String(item.item_name || "").trim(),
          item_qty: qty,
          item_mrp: mrp,
          item_price: price,
          item_tax: tax,
          item_disc: discount,
          item_cess: cess,
          trx_total: lineTotal,
        };
      });

      const trx_total = round2(
        normalizedItems.reduce((sum, item) => sum + item.trx_total, 0)
      );

      const trx_netamount = trx_total;

      const trx_disc = round2(
        normalizedItems.reduce((sum, item) => {
          return sum + (((item.item_price * item.item_disc) / 100) * item.item_qty);
        }, 0)
      );

      await OrdMast.updateOne(
        { comp_code, ord_no, user_code },
        {
          $set: {
            ord_date: ord_date || existingOrder.ord_date,
            ord_time: ord_time || existingOrder.ord_time,
            act_code: customer?.code ?? existingOrder.act_code,
            act_name: customer?.name ?? existingOrder.act_name,
            act_phone: customer?.phone ?? existingOrder.act_phone,
            act_address: customer?.address ?? existingOrder.act_address,
            act_area: customer?.area ?? existingOrder.act_area,
            act_type: customer?.type ?? existingOrder.act_type,
            status_flag: status_flag ?? existingOrder.status_flag,
            trx_disc,
            trx_total,
            trx_netamount,
          },
        }
      );

      await OrdTrxfile.deleteMany({ comp_code, ord_no });

      if (normalizedItems.length > 0) {
        await OrdTrxfile.insertMany(
          normalizedItems.map((item) => ({
            comp_code,
            ord_no,
            ord_date: ord_date || existingOrder.ord_date,
            line_no: item.line_no,
            item_code: item.item_code,
            item_name: item.item_name,
            item_qty: item.item_qty,
            item_mrp: item.item_mrp,
            item_price: item.item_price,
            item_tax: item.item_tax,
            item_disc: item.item_disc,
            item_cess: item.item_cess,
            trx_total: item.trx_total,
            status_flag: status_flag ?? existingOrder.status_flag,
          }))
        );
      }

      return res.status(200).json({
        message: "Order updated successfully",
        order: {
          ord_no,
          trx_total,
          trx_netamount,
          item_count: normalizedItems.length,
        },
      });
    } catch (error) {
      console.error("updateOrderDetails error:", error);
      return res.status(500).json({
        message: "Internal server error",
        error: error.message,
      });
    }
  },
 deleteOrder: async (req, res) => {
  try {
    const comp_code = String(req.comp_code ?? "").trim();
    const user_code = String(req.user?.user_id ?? "").trim();
    const ord_no = Number(req.params.ord_no);

    if (
      !comp_code ||
      !user_code ||
      !Number.isSafeInteger(ord_no) ||
      ord_no <= 0
    ) {
      return res.status(400).json({
        message: "Invalid request context",
      });
    }

    const existingOrder = await OrdMast.findOne({
      comp_code,
      ord_no,
      user_code,
    }).lean();

    if (!existingOrder) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    const lineDeleteResult = await OrdTrxfile.deleteMany({
      comp_code,
      ord_no,
    });

    const orderDeleteResult = await OrdMast.deleteOne({
      comp_code,
      ord_no,
      user_code,
    });

    if (orderDeleteResult.deletedCount !== 1) {
      return res.status(409).json({
        message: "Order master could not be deleted",
        ord_no,
        deletedLineItems: lineDeleteResult.deletedCount,
      });
    }

    return res.status(200).json({
      message: "Order deleted successfully",
      ord_no,
      deletedLineItems: lineDeleteResult.deletedCount,
      deletedOrders: orderDeleteResult.deletedCount,
    });
  } catch (error) {
    console.error("deleteOrder error:", error);

    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
},
  deleteAllCustMast: async (req, res) => {
    try {
      const tokenCompCode = String(req.comp_code || "").trim();
      const bodyCompCode = String(req.body?.comp_code || "").trim();
      console.log("Compcode : ", tokenCompCode, bodyCompCode)
      console.log("Compcode check: ", tokenCompCode === bodyCompCode)
      if (!bodyCompCode) {
        return res.status(400).json({ message: "comp_code is required" });
      }

      if (!tokenCompCode) {
        return res.status(401).json({ message: "Unauthorized: missing comp_code in token" });
      }

      if (tokenCompCode !== bodyCompCode) {
        return res.status(403).json({
          message: "Forbidden: you can delete only your own company data",
        });
      }

      const result = await CustMast.deleteMany({ comp_code: bodyCompCode });

      return res.status(200).json({
        message: "CustMast records deleted successfully",
        comp_code: bodyCompCode,
        deletedCount: result.deletedCount,
      });
    } catch (error) {
      console.error("deleteAllCustMast error:", error);
      return res.status(500).json({
        message: "Internal server error",
        error: error.message,
      });
    }
  },

  deleteAllItemMast: async (req, res) => {
    try {
      const tokenCompCode = String(req.comp_code || "").trim();
      const bodyCompCode = String(req.body?.comp_code || "").trim();

      if (!bodyCompCode) {
        return res.status(400).json({ message: "comp_code is required" });
      }

      if (!tokenCompCode) {
        return res.status(401).json({ message: "Unauthorized: missing comp_code in token" });
      }

      if (tokenCompCode !== bodyCompCode) {
        return res.status(403).json({
          message: "Forbidden: you can delete only your own company data",
        });
      }

      const result = await ItemMast.deleteMany({ comp_code: bodyCompCode });

      return res.status(200).json({
        message: "ItemMast records deleted successfully",
        comp_code: bodyCompCode,
        deletedCount: result.deletedCount,
      });
    } catch (error) {
      console.error("deleteAllItemMast error:", error);
      return res.status(500).json({
        message: "Internal server error",
        error: error.message,
      });
    }
  },

  deleteAllUserMast: async (req, res) => {
    try {
      const tokenCompCode = String(req.comp_code || "").trim();
      const bodyCompCode = String(req.body?.comp_code || "").trim();

      if (!bodyCompCode) {
        return res.status(400).json({ message: "comp_code is required" });
      }

      if (!tokenCompCode) {
        return res.status(401).json({ message: "Unauthorized: missing comp_code in token" });
      }

      if (tokenCompCode !== bodyCompCode) {
        return res.status(403).json({
          message: "Forbidden: you can delete only your own company data",
        });
      }

      const result = await UserMast.deleteMany({ comp_code: bodyCompCode });

      return res.status(200).json({
        message: "UserMast records deleted successfully",
        comp_code: bodyCompCode,
        deletedCount: result.deletedCount,
      });
    } catch (error) {
      console.error("deleteAllUserMast error:", error);
      return res.status(500).json({
        message: "Internal server error",
        error: error.message,
      });
    }
  },
 // ------------------------------------------
  // ✅ ADMIN: Get all customers (comp_code optional — omit to search all companies)
  // ------------------------------------------
  getAllCustAdmin: async (req, res) => {
    try {
      const comp_code = String(req.query.comp_code || "").trim();

      const pageNum = Math.max(Number(req.query.page || 1), 1);
      const limitNum = Math.max(Number(req.query.limit || 10), 1);
      const skip = (pageNum - 1) * limitNum;
      const area = req.query.area?.trim();
      const name = req.query.name?.trim();

      const query = {};

      if (comp_code) {
        const compNum = Number(comp_code);
        query.comp_code = Number.isNaN(compNum)
          ? comp_code
          : { $in: [comp_code, String(compNum)] };
      }

      if (area) query.cust_area = area;
      if (name) query.cust_name = { $regex: name, $options: "i" };

      const totalMatching = await CustMast.countDocuments(query);

      const customers = await CustMast.find(query)
        .collation({ locale: "en", strength: 2 })
        .sort({ cust_name: 1 })
        .skip(skip)
        .limit(limitNum)
        .lean();

      const areas = await CustMast.distinct("cust_area", query);

      return res.status(200).json({
        users: customers.map((customer) => ({
          comp_code: customer.comp_code,
          cust_code: customer.cust_code,
          cust_name: customer.cust_name,
          cust_phone: customer.cust_phone || "N/A",
          cust_address: customer.cust_address || "N/A",
          cust_area: customer.cust_area || "N/A",
          cust_type: customer.cust_type || "R",
          cust_gst: customer.cust_gst || "N/A",
          old_bal: customer.Old_bal ?? 0,
        })),
        areas: areas.filter(Boolean).sort((a, b) => a.localeCompare(b)),
        total: totalMatching,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalMatching / limitNum),
      });
    } catch (error) {
      console.error("getAllCustAdmin error:", error);
      return res.status(500).json({
        message: "Internal server error",
        error: error.message,
      });
    }
  },
  // ------------------------------------------
  // ✅ ADMIN: List all distinct comp_codes from CustMast (searchable)
  // ------------------------------------------
  getAllCompCodes: async (req, res) => {
    try {
      const search = String(req.query.search || "").trim();

      let compCodes = await CustMast.distinct("comp_code");
      compCodes = compCodes.filter(Boolean).map(String);

      if (search) {
        const lower = search.toLowerCase();
        compCodes = compCodes.filter((code) => code.toLowerCase().includes(lower));
      }

      compCodes.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

      return res.status(200).json({
        count: compCodes.length,
        data: compCodes,
      });
    } catch (error) {
      console.error("getAllCompCodes error:", error);
      return res.status(500).json({
        message: "Internal server error",
        error: error.message,
      });
    }
  },

  // ------------------------------------------
  // ✅ ADMIN: List all companies (for company picker screen)
  // ------------------------------------------
  getAllCompanies: async (req, res) => {
    try {
      const companies = await CompMast.find({})
        .select("comp_code comp_name comp_phone comp_email")
        .sort({ comp_name: 1 })
        .lean();

      return res.status(200).json({
        count: companies.length,
        data: companies,
      });
    } catch (error) {
      console.error("getAllCompanies error:", error);
      return res.status(500).json({
        message: "Internal server error",
        error: error.message,
      });
    }
  },
};

// ==========================================
// BILL: HTML template -> PDF (Puppeteer)
// ==========================================

const __dirname_ctrl = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.join(__dirname_ctrl, "..", "assets");

const escapeHtml = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const money = (n) => Number(n || 0).toFixed(2);

// Logo lookup: assets/logos/<comp_code>.(png|jpg|jpeg|svg|webp), else assets/logo.*
const LOGO_MIMES = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", svg: "image/svg+xml", webp: "image/webp" };
const logoCache = new Map();
async function getLogo(comp_code) {
  if (logoCache.has(comp_code)) return logoCache.get(comp_code);

  const candidates = [];
  for (const ext of Object.keys(LOGO_MIMES)) candidates.push([path.join(ASSETS_DIR, "logos", `${comp_code}.${ext}`), ext]);
  for (const ext of Object.keys(LOGO_MIMES)) candidates.push([path.join(ASSETS_DIR, `logo.${ext}`), ext]);

  let logo = null;
  for (const [file, ext] of candidates) {
    try {
      logo = { buf: await fs.readFile(file), ext, mime: LOGO_MIMES[ext] };
      break;
    } catch {
      /* try next */
    }
  }
  logoCache.set(comp_code, logo);
  return logo;
}

// Embedded as a data URI so Chrome never has to fetch anything over the network.
async function getLogoDataUri(comp_code) {
  const logo = await getLogo(comp_code);
  return logo ? `data:${logo.mime};base64,${logo.buf.toString("base64")}` : null;
}

async function getCompany(comp_code) {
  return (await CompMast.findOne({ comp_code }).lean().catch(() => null)) || {};
}

async function generateHTMLBill(comp_code, ord_no, ordMast, trxItems) {
  const total = Number(ordMast.trx_total || 0);
  const net = Number(ordMast.trx_netamount || total);

  const company = await getCompany(comp_code);
  const logo = await getLogoDataUri(comp_code);

  const compName = company.comp_name || `Company ${comp_code}`;
  const compAddress = [company.comp_address_one, company.comp_address_two].filter(Boolean).join(", ");
  const compContact = [
    company.comp_phone && `Ph: ${company.comp_phone}`,
    company.comp_email,
  ].filter(Boolean).join(" · ");

  const rowsHtml = trxItems
    .map(
      (item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td class="item">${escapeHtml(item.item_name)}</td>
        <td class="num">${escapeHtml(item.item_qty)}</td>
        <td class="num">${money(item.item_mrp)}</td>
        <td class="num">${money(item.item_price)}</td>
        <td class="num">${money(item.item_tax)}</td>
        <td class="num">${money(item.item_disc)}</td>
        <td class="num">${money(item.trx_total)}</td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Bill - ${ord_no}</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Malayalam", Helvetica, Arial, sans-serif;
        font-size: 11px;
        color: #222;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        padding-bottom: 10px;
        border-bottom: 2px solid #6c63ff;
        margin-bottom: 10px;
      }
      .company { display: flex; gap: 10px; align-items: center; }
      .logo { max-height: 52px; max-width: 110px; object-fit: contain; }
      .brand { font-size: 16px; font-weight: 700; letter-spacing: 0.3px; }
      .sub { font-size: 9.5px; color: #666; line-height: 1.4; }
      .invoice { text-align: right; }
      .invoice-title { font-size: 15px; font-weight: 700; color: #6c63ff; }

      .meta { display: flex; gap: 12px; margin-bottom: 10px; font-size: 10px; }
      .meta-block { flex: 1; background: #f6f6fb; border-radius: 6px; padding: 6px 8px; }
      .meta-label { font-weight: 600; }
      .meta-row { margin-bottom: 2px; }

      table { width: 100%; border-collapse: collapse; }
      thead { display: table-header-group; } /* repeat header on each page */
      tr { page-break-inside: avoid; }
      th, td { padding: 5px 4px; border-bottom: 1px solid #e1e1e6; font-size: 10px; vertical-align: top; }
      th { background: #6c63ff; color: #fff; font-weight: 600; text-align: left; }
      th.num { text-align: right; }
      tbody tr:nth-child(even) td { background: #fafaff; }
      .num { text-align: right; white-space: nowrap; }
      .item { word-break: break-word; }

      .totals { margin-top: 10px; margin-left: auto; width: 55%; page-break-inside: avoid; }
      .totals-row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 11px; }
      .totals-row.net { border-top: 1px solid #ccc; margin-top: 3px; padding-top: 6px; font-size: 13px; font-weight: 700; }

      .footer { margin-top: 16px; text-align: center; font-size: 9.5px; color: #777; }
    </style>
  </head>
  <body>
    <div class="header">
      <div class="company">
        ${logo ? `<img class="logo" src="${logo}" alt="logo" />` : ""}
        <div>
          <div class="brand">${escapeHtml(compName)}</div>
          ${compAddress ? `<div class="sub">${escapeHtml(compAddress)}</div>` : ""}
          ${compContact ? `<div class="sub">${escapeHtml(compContact)}</div>` : ""}
          ${company.comp_gst_num ? `<div class="sub">GSTIN: ${escapeHtml(company.comp_gst_num)}</div>` : ""}
        </div>
      </div>
      <div class="invoice">
        <div class="invoice-title">Bill #${ord_no}</div>
        <div class="sub">${escapeHtml(ordMast.ord_date)} · ${escapeHtml(ordMast.ord_time)}</div>
      </div>
    </div>

    <div class="meta">
      <div class="meta-block">
        <div class="meta-row"><span class="meta-label">Order No:</span> ${ord_no}</div>
        <div class="meta-row"><span class="meta-label">Date:</span> ${escapeHtml(ordMast.ord_date)}</div>
        <div class="meta-row"><span class="meta-label">Time:</span> ${escapeHtml(ordMast.ord_time)}</div>
      </div>
      <div class="meta-block">
        <div class="meta-row"><span class="meta-label">Customer:</span> ${escapeHtml(ordMast.act_name || "-")}</div>
        <div class="meta-row"><span class="meta-label">Code:</span> ${escapeHtml(ordMast.act_code || "-")}</div>
        ${ordMast.act_phone ? `<div class="meta-row"><span class="meta-label">Phone:</span> ${escapeHtml(ordMast.act_phone)}</div>` : ""}
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Item</th>
          <th class="num">Qty</th>
          <th class="num">MRP</th>
          <th class="num">Rate</th>
          <th class="num">Tax %</th>
          <th class="num">Disc</th>
          <th class="num">Subtotal</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>

    <div class="totals">
      <div class="totals-row"><span>Items</span><span>${trxItems.length}</span></div>
      <div class="totals-row"><span>Total</span><span>${money(total)}</span></div>
      <div class="totals-row net"><span>Net Amount</span><span>${money(net)}</span></div>
    </div>

    ${company.inv_msgs ? `<div class="footer">${escapeHtml(company.inv_msgs)}</div>` : ""}
  </body>
</html>`;
}

// ---- Puppeteer: one shared browser, reused for every bill ----
// Uses the Chrome that Puppeteer downloads itself (chrome-headless-shell).
// Snap Chromium (/snap/bin/chromium) is ignored: its sandbox kills the
// process when it's launched from Node, which caused
// "Failed to launch the browser process ... ptrace: Input/output error".
let browserPromise = null;

function resolveExecutablePath() {
  const p = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH;
  if (!p || p.includes("/snap/")) return undefined; // let Puppeteer use its own Chrome
  return p;
}

async function getBrowser() {
  if (browserPromise) {
    const existing = await browserPromise.catch(() => null);
    if (existing && existing.connected) return existing;
    browserPromise = null;
  }

  browserPromise = puppeteer.launch({
    headless: "shell",
    timeout: 20000,
    executablePath: resolveExecutablePath(),
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--font-render-hinting=none",
    ],
  });

  try {
    const browser = await browserPromise;
    browser.on("disconnected", () => {
      browserPromise = null;
    });
    return browser;
  } catch (err) {
    browserPromise = null;
    throw err;
  }
}

async function generatePdfBuffer(html, attempt = 1) {
  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load", timeout: 30000 });
    const pdf = await page.pdf({
      format: "A5",
      printBackground: true,
      margin: { top: "8mm", right: "8mm", bottom: "8mm", left: "8mm" },
    });
    return Buffer.from(pdf);
  } catch (err) {
    // Browser may have crashed between orders: relaunch once and retry.
    if (attempt === 1) {
      browserPromise = null;
      return generatePdfBuffer(html, 2);
    }
    throw err;
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

// ---- Main entry: Chrome first, PDFKit fallback ----
// If Chrome fails, skip it for a few minutes so orders don't keep waiting
// on a broken browser, then try it again automatically.
const CHROME_RETRY_AFTER_MS = 5 * 60 * 1000;
let chromeDisabledUntil = 0;

async function generateBillPdf(comp_code, ord_no, ordMast, trxItems) {
  if (Date.now() >= chromeDisabledUntil) {
    try {
      const html = await generateHTMLBill(comp_code, ord_no, ordMast, trxItems);
      const pdfBuffer = await generatePdfBuffer(html);
      return { pdfBuffer, renderer: "chrome" };
    } catch (chromeErr) {
      chromeDisabledUntil = Date.now() + CHROME_RETRY_AFTER_MS;
      console.error(
        `[bill] Chrome PDF failed for order ${ord_no}, falling back to PDFKit ` +
          `(Chrome skipped for ${CHROME_RETRY_AFTER_MS / 60000} min):`,
        chromeErr.message
      );
    }
  }

  const pdfBuffer = await generatePdfKitBill(comp_code, ord_no, ordMast, trxItems);
  return { pdfBuffer, renderer: "pdfkit" };
}

// ---- PDFKit fallback: same bill layout, drawn without a browser ----
// Note: PDFKit's built-in Helvetica only covers English text, and only
// PNG/JPG logos can be drawn (SVG/WEBP logos are skipped here).
async function generatePdfKitBill(comp_code, ord_no, ordMast, trxItems) {
  const company = await getCompany(comp_code);
  const logo = await getLogo(comp_code);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A5", margin: 23 }); // ~8mm
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const ACCENT = "#6c63ff";
    const TEXT = "#222222";
    const MUTED = "#666666";
    const LINE = "#e1e1e6";

    const left = doc.page.margins.left;
    const W = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const bottom = () => doc.page.height - doc.page.margins.bottom;
    let y = doc.page.margins.top;

    // ---- Header: logo + company | bill no ----
    let textX = left;
    if (logo && (logo.ext === "png" || logo.ext === "jpg" || logo.ext === "jpeg")) {
      try {
        doc.image(logo.buf, left, y, { fit: [70, 40], valign: "center" });
        textX = left + 78;
      } catch {
        /* bad image file - skip logo */
      }
    }
    const rightW = 95;
    const compW = W - (textX - left) - rightW - 6;

    doc.fillColor(TEXT).font("Helvetica-Bold").fontSize(13)
      .text(company.comp_name || `Company ${comp_code}`, textX, y, { width: compW });
    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED);
    const address = [company.comp_address_one, company.comp_address_two].filter(Boolean).join(", ");
    const contact = [company.comp_phone && `Ph: ${company.comp_phone}`, company.comp_email].filter(Boolean).join("  ·  ");
    if (address) doc.text(address, textX, doc.y + 1, { width: compW });
    if (contact) doc.text(contact, textX, doc.y + 1, { width: compW });
    if (company.comp_gst_num) doc.text(`GSTIN: ${company.comp_gst_num}`, textX, doc.y + 1, { width: compW });
    const compBottom = doc.y;

    doc.fillColor(ACCENT).font("Helvetica-Bold").fontSize(13)
      .text(`Bill #${ord_no}`, left + W - rightW, y, { width: rightW, align: "right" });
    doc.fillColor(MUTED).font("Helvetica").fontSize(7.5)
      .text(`${ordMast.ord_date || ""}  ·  ${ordMast.ord_time || ""}`, left + W - rightW, doc.y + 2, { width: rightW, align: "right" });

    y = Math.max(compBottom, y + 42) + 6;
    doc.moveTo(left, y).lineTo(left + W, y).lineWidth(1.5).strokeColor(ACCENT).stroke();
    y += 8;

    // ---- Order / customer boxes ----
    const boxW = (W - 8) / 2;
    const metaBox = (x, rows) => {
      const h = rows.length * 11 + 8;
      doc.roundedRect(x, y, boxW, h, 4).fill("#f6f6fb");
      rows.forEach(([label, value], i) => {
        doc.fillColor(TEXT).font("Helvetica-Bold").fontSize(7.5)
          .text(`${label} `, x + 6, y + 5 + i * 11, { continued: true, width: boxW - 12, lineBreak: false, ellipsis: true })
          .font("Helvetica").text(String(value ?? "-"));
      });
      return h;
    };
    const customerRows = [
      ["Customer:", ordMast.act_name || "-"],
      ["Code:", ordMast.act_code || "-"],
    ];
    if (ordMast.act_phone) customerRows.push(["Phone:", ordMast.act_phone]);
    const h1 = metaBox(left, [["Order No:", ord_no], ["Date:", ordMast.ord_date], ["Time:", ordMast.ord_time]]);
    const h2 = metaBox(left + boxW + 8, customerRows);
    y += Math.max(h1, h2) + 8;

    // ---- Items table ----
    const cols = [
      { key: "sl", label: "#", w: 16, align: "left" },
      { key: "name", label: "Item", w: 0, align: "left" }, // takes the remaining width
      { key: "qty", label: "Qty", w: 28, align: "right" },
      { key: "mrp", label: "MRP", w: 38, align: "right" },
      { key: "rate", label: "Rate", w: 38, align: "right" },
      { key: "tax", label: "Tax %", w: 30, align: "right" },
      { key: "disc", label: "Disc", w: 30, align: "right" },
      { key: "total", label: "Subtotal", w: 48, align: "right" },
    ];
    cols[1].w = W - cols.reduce((sum, c) => sum + c.w, 0);
    const PAD = 4;

    const rowHeight = (values, font) => {
      doc.font(font).fontSize(7.5);
      return Math.max(...cols.map((c) => doc.heightOfString(String(values[c.key]), { width: c.w - 4 }))) + PAD * 2;
    };
    const drawCells = (values, color) => {
      let x = left;
      doc.fillColor(color);
      for (const c of cols) {
        doc.text(String(values[c.key]), x + 2, y + PAD, { width: c.w - 4, align: c.align });
        x += c.w;
      }
    };
    const headerValues = Object.fromEntries(cols.map((c) => [c.key, c.label]));
    const drawHeader = () => {
      const h = rowHeight(headerValues, "Helvetica-Bold");
      doc.rect(left, y, W, h).fill(ACCENT);
      doc.font("Helvetica-Bold").fontSize(7.5);
      drawCells(headerValues, "#ffffff");
      y += h;
    };

    drawHeader();
    trxItems.forEach((item, i) => {
      const values = {
        sl: i + 1,
        name: item.item_name || "",
        qty: item.item_qty ?? 0,
        mrp: money(item.item_mrp),
        rate: money(item.item_price),
        tax: money(item.item_tax),
        disc: money(item.item_disc),
        total: money(item.trx_total),
      };
      const h = rowHeight(values, "Helvetica");
      if (y + h > bottom()) {
        doc.addPage();
        y = doc.page.margins.top;
        drawHeader();
      }
      if (i % 2 === 1) doc.rect(left, y, W, h).fill("#fafaff");
      doc.font("Helvetica").fontSize(7.5);
      drawCells(values, TEXT);
      y += h;
      doc.moveTo(left, y).lineTo(left + W, y).lineWidth(0.5).strokeColor(LINE).stroke();
    });

    // ---- Totals ----
    const total = Number(ordMast.trx_total || 0);
    const net = Number(ordMast.trx_netamount || total);
    const footerH = company.inv_msgs ? 24 : 0;
    if (y + 60 + footerH > bottom()) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    y += 8;
    const tx = left + W * 0.45;
    const tw = W * 0.55;
    const totalRow = (label, value, bold, size) => {
      doc.fillColor(TEXT).font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size);
      doc.text(label, tx, y, { width: tw / 2 });
      doc.text(String(value), tx + tw / 2, y, { width: tw / 2, align: "right" });
      y += size + 6;
    };
    totalRow("Items", trxItems.length, false, 8.5);
    totalRow("Total", money(total), false, 8.5);
    doc.moveTo(tx, y).lineTo(tx + tw, y).lineWidth(0.7).strokeColor("#cccccc").stroke();
    y += 5;
    totalRow("Net Amount", money(net), true, 11);

    if (company.inv_msgs) {
      doc.fillColor("#777777").font("Helvetica").fontSize(7.5)
        .text(company.inv_msgs, left, y + 10, { width: W, align: "center" });
    }

    doc.end();
  });
}

export default custController;