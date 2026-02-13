import mongoose from "mongoose";
import { z } from "zod";
import CustMast from "../models/CustMast.js"; // Assuming you have a models directory for database operations

import ItemMast from "../models/ItemMast.js";

import OrdMast from "../models/OrdMast.js";
import OrdTrxfile from "../models/OrdTrxfile.js";

import CompMast from "../models/CompMast.js";

import UserMast from "../models/UserMast.js";
import puppeteer from "puppeteer";
import pdfkit from "pdfkit";
import bcrypt from "bcryptjs";

// ==========================================
// ✅ ADD THESE SCHEMAS & HELPERS
// ==========================================

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
const custController = {
  getAllCust: async (req, res) => {
    try {
      const comp_code = req.comp_code; // from token
      console.log("comp_code from token:", comp_code, typeof comp_code);

      const pageNum = Number(req.query.page || 1);
      const limitNum = Number(req.query.limit || 10);
      const skip = (pageNum - 1) * limitNum;

      const area = req.query.area;

      // Build comp_code variants safely
      const compStr = String(comp_code);
      const compNum = Number(comp_code);
      const compVariants = Number.isNaN(compNum) ? [compStr] : [compStr, compNum];

      const query = {
        comp_code: { $in: compVariants },
        ...(area ? { cust_area: area } : {}),
      };

      // 🔍 DEBUG: verify data exists in the same collection
      const totalMatching = await CustMast.countDocuments(query);
      const totalAll = await CustMast.countDocuments({});
      const sampleAny = await CustMast.findOne({});
      const sampleForComp = await CustMast.findOne({ comp_code: { $in: compVariants } });

      console.log("DEBUG query:", query);
      console.log("DEBUG totalAll:", totalAll);
      console.log("DEBUG totalMatching:", totalMatching);
      console.log("DEBUG sampleAny:", sampleAny?.comp_code, typeof sampleAny?.comp_code);
      console.log("DEBUG sampleForComp:", sampleForComp?.comp_code, typeof sampleForComp?.comp_code);

      const customers = await CustMast.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum);
      console.log(customers)
      if (customers.length === 0) {
        return res.status(404).json({ message: "No customers found" });
      }

      const areas = await CustMast.distinct("cust_area", {
        comp_code: { $in: compVariants },
      });

      return res.status(200).json({
        users: customers.map((customer) => ({
          cust_code: customer.cust_code,
          cust_name: customer.cust_name,
          cust_phone: customer.cust_phone || "N/A",
          cust_address: customer.cust_address || "N/A",
          cust_area: customer.cust_area,
          cust_type: customer.cust_type,
          cust_gst: customer.cust_gst,
          old_bal: customer.Old_bal,
        })),
        areas,
        total: totalMatching,
      });
    } catch (error) {
      console.error("getAllCust error:", error);
      return res.status(500).json({
        message: "Internal server error",
        error: error.message,
      });
    }
  },





  getAllShopDetails: async (req, res) => {
    try {
      const comp_code = req.comp_code;
      const shopDetails = await ItemMast.find({ comp_code: String(comp_code) });


      // console.log(shopDetails, "werty");
      if (shopDetails.length > 0) {
        return res.status(200).json(shopDetails);
      } else {
        return res.status(400).json({ message: "Shops data not found!" });
      }
    } catch (error) {
      res
        .status(500)
        .json({ message: "Internal server error", error: error.message });
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
      const comp_code = String(req.comp_code).trim();
      const user_code = String(req.user?.user_id || "").trim();

      if (!comp_code || !user_code) {
        return res.status(401).json({ message: "Invalid token context" });
      }

      const pageNum = Number(req.query.page || 1);
      const limitNum = Number(req.query.limit || 10);
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

      /* ===============================
         1️⃣ PAGINATED DATA WITH CUSTOMER NAME
         =============================== */
      const orders = await OrdMast.aggregate([
        { $match: matchQuery },

        {
          $lookup: {
            from: "custmasts",
            let: {
              compCode: "$comp_code",
              actCode: "$act_code"
            },
            pipeline: [
              {
                $addFields: {
                  cust_code_num: {
                    $toInt: {
                      $getField: {
                        field: "match",
                        input: {
                          $regexFind: { input: "$cust_code", regex: /^[0-9]+/ },
                        },
                      },
                    },
                  },
                },
              },
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$comp_code", "$$compCode"] },
                      { $eq: ["$cust_code_num", { $add: [1000, { $toInt: "$$actCode" }] }] }
                    ],
                  },
                },
              },
              { $project: { cust_name: 1, _id: 0 } },
            ],
            as: "customer",
          },
        }
        ,

        {
          $addFields: {
            cust_name: {
              $ifNull: [{ $arrayElemAt: ["$customer.cust_name", 0] }, "-"],
            },
          },
        },

        { $project: { customer: 0 } },

        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limitNum },
      ]);

      /* ===============================
         2️⃣ TOTAL COUNT
         =============================== */
      const total = await OrdMast.countDocuments(matchQuery);

      /* ===============================
         3️⃣ SUBTOTAL OF FILTERED DATA
         =============================== */
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
        : { trx_total: 0, trx_netamount: 0, count: 0 };

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
      const comp_code = String(req.comp_code).trim();
      const user_code = String(req.user?.user_id || "").trim(); // optional validation
      const ord_no = Number(req.params.ord_no);

      if (!comp_code || !ord_no) {
        return res.status(400).json({
          message: "comp_code and ord_no are required",
        });
      }

      // 1️⃣ Fetch Order Master
      const order = await OrdMast.findOne({
        comp_code,
        ord_no,
        user_code, // 🔒 ensures user can only view their own orders
      }).lean();

      if (!order) {
        return res.status(404).json({
          message: "Order not found",
        });
      }

      // 2️⃣ Fetch Order Line Items
      const items = await OrdTrxfile.find({
        comp_code,
        ord_no,
      })
        .sort({ line_no: 1 })
        .lean();

      // 3️⃣ Calculate totals from items (safe recalculation)
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

      return res.status(200).json({
        order: {
          ord_no: order.ord_no,
          ord_date: order.ord_date,
          ord_time: order.ord_time,
          status: order.status_flag === "Y" ? "BILLED" : "PENDING",

          customer: {
            code: order.act_code,
            name: order.act_name,
            phone: order.act_phone,
            address: order.act_address,
            area: order.act_area,
          },

          totals: {
            trx_total: order.trx_total,
            trx_netamount: order.trx_netamount,
          },
        },

        items: items.map((item) => ({
          line_no: item.line_no,
          item_code: item.item_code,
          item_name: item.item_name,
          qty: item.item_qty,
          mrp: item.item_mrp,
          price: item.item_price,
          tax: item.item_tax,
          discount: item.item_disc,
          cess: item.item_cess,
          total: item.trx_total,
        })),

        computed_summary: summary, // recalculated from line items
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
      const { order_details } = req.body;
      const comp_code = req.comp_code;
      const user_id = req.user?.user_id;
      const lastOrder = await OrdMast.findOne({ comp_code })
        .sort({ ord_no: -1 })
        .lean();
      const ord_no = lastOrder ? lastOrder.ord_no + 1 : 1;
      const totalAmount = order_details.reduce(
        (sum, item) => sum + item.subtotal,
        0
      );

      const ordMast = new OrdMast({
        comp_code,
        ord_no,
        ord_date: new Date().toISOString().split("T")[0],
        ord_time: new Date().toTimeString().split(" ")[0],
        act_code: user_id,
        trx_total: totalAmount,
        trx_netamount: totalAmount,
        user_code: user_id,
        status_flag: "N",
      });

      const trxItems = order_details.map(
        (item, index) =>
          new OrdTrxfile({
            comp_code,
            ord_no,
            line_no: index + 1,
            ord_date: new Date().toISOString().split("T")[0],
            item_name: item.item_name,
            item_qty: item.qty,
            item_mrp: item.item_mrp,
            item_price: item.item_price1,
            item_tax: item.item_tax,
            item_disc: item.discount,
            trx_total: item.subtotal,
            status_flag: "N",
          })
      );

      await ordMast.save();
      await OrdTrxfile.insertMany(trxItems);

      const htmlBill = await generateHTMLBill(
        comp_code,
        ord_no,
        ordMast,
        trxItems
      );
      const pdfBuffer = await generatePdfBuffer(htmlBill);

      res.set(
        "Content-Disposition",
        `attachment; filename="bill_${ord_no}.pdf"`
      );
      res.set("Content-Type", "application/pdf");
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Order Error:", error);
      res.status(500).json({ message: "Order failed", error: error.message });
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


  syncItemMast: async (req, res) => {
    try {
      // 1. Validate
      const validation = itemMastSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          message: "Validation Failed",
          errors: formatZodError(validation.error),
        });
      }

      const items = validation.data;
      if (items.length === 0) {
        return res.status(200).json({ message: "No items to sync." });
      }

      // 2. Prepare Bulk Ops (Match comp_code AND item_code)
      const bulkOps = items.map((item) => ({
        updateOne: {
          filter: {
            comp_code: String(item.comp_code),
            item_code: String(item.item_code),
          },
          update: { $set: item }, // Replace fields from JSON into DB
          upsert: true, // Create if not found
        },
      }));

      // 3. Execute
      const result = await ItemMast.bulkWrite(bulkOps);

      return res.status(200).json({
        message: "Item Master synced successfully",
        details: {
          matched: result.matchedCount,
          modified: result.modifiedCount,
          upserted: result.upsertedCount,
        },
      });
    } catch (error) {
      console.error("syncItemMast error:", error);
      return res
        .status(500)
        .json({ message: "Internal Server Error", error: error.message });
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
};

async function generateHTMLBill(comp_code, ord_no, ordMast, trxItems) {
  const total = Number(ordMast.trx_total || 0);
  const net = Number(ordMast.trx_netamount || total);

  const rowsHtml = trxItems
    .map(
      (item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${item.item_name}</td>
        <td class="num">${item.item_qty}</td>
        <td class="num">${Number(item.item_mrp || 0).toFixed(2)}</td>
        <td class="num">${Number(item.item_price || 0).toFixed(2)}</td>
        <td class="num">${Number(item.item_tax || 0).toFixed(2)}</td>
        <td class="num">${Number(item.item_disc || 0).toFixed(2)}</td>
        <td class="num">${Number(item.trx_total || 0).toFixed(2)}</td>
      </tr>
    `
    )
    .join("");

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Bill - ${ord_no}</title>
        <style>
          * {
            box-sizing: border-box;
          }
          body {
            margin: 0;
            padding: 16px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI",
              Roboto, Helvetica, Arial, sans-serif;
            background: #f4f4f8;
            font-size: 12px;
            color: #222;
          }
          .wrapper {
            max-width: 640px;
            margin: 0 auto;
          }
          .card {
            background: #fff;
            border-radius: 8px;
            padding: 16px 18px 20px;
            box-shadow: 0 2px 6px rgba(0,0,0,0.08);
          }

          .header-top {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 12px;
          }
          .brand {
            font-size: 18px;
            font-weight: 700;
            letter-spacing: 0.5px;
          }
          .invoice-title {
            font-size: 16px;
            font-weight: 600;
            text-align: right;
          }

          .meta {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 12px;
            font-size: 11px;
          }
          .meta-block {
            flex: 1;
          }
          .meta-label {
            font-weight: 600;
          }
          .meta-row {
            margin-bottom: 2px;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 8px;
          }
          th, td {
            padding: 6px 5px;
            border-bottom: 1px solid #e1e1e6;
          }
          th {
            background: #fafafa;
            font-weight: 600;
            font-size: 11px;
          }
          td {
            font-size: 11px;
          }
          .num {
            text-align: right;
            white-space: nowrap;
          }
          .totals {
            margin-top: 10px;
            font-size: 12px;
          }
          .totals-row {
            display: flex;
            justify-content: flex-end;
          }
          .totals-label {
            font-weight: 600;
            margin-right: 8px;
          }
          .totals-value {
            min-width: 80px;
            text-align: right;
          }
        </style>
      </head>
      <body>
        <div class="wrapper">
          <div class="card">
            <div class="header-top">
              <div>
                <div class="brand">Company ${comp_code}</div>
                <div style="font-size:11px;color:#666;">Invoice / Bill</div>
              </div>
              <div class="invoice-title">
                Bill #${ord_no}
              </div>
            </div>

            <div class="meta">
              <div class="meta-block">
                <div class="meta-row"><span class="meta-label">Order No:</span> ${ord_no}</div>
                <div class="meta-row"><span class="meta-label">Date:</span> ${ordMast.ord_date}</div>
                <div class="meta-row"><span class="meta-label">Time:</span> ${ordMast.ord_time}</div>
              </div>
              <div class="meta-block">
                <div class="meta-row"><span class="meta-label">Customer Code:</span> ${ordMast.act_code || "-"}</div>
                <div class="meta-row"><span class="meta-label">Customer Name:</span> ${ordMast.act_name || "-"}</div>
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
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>

            <div class="totals">
              <div class="totals-row">
                <div class="totals-label">Total:</div>
                <div class="totals-value">${total.toFixed(2)}</div>
              </div>
              <div class="totals-row">
                <div class="totals-label">Net Amount:</div>
                <div class="totals-value">${net.toFixed(2)}</div>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

  return html;
}

// Puppeteer PDF with better sizing
// async function generatePdfBuffer(html) {
//   const browser = await puppeteer.launch({
//     headless: "new",
//     executablePath:
//       process.env.CHROME_PATH ||
//       "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
//     args: ["--no-sandbox", "--disable-setuid-sandbox"],
//   });

//   try {
//     const page = await browser.newPage();
//     await page.setContent(html, { waitUntil: "networkidle0" });

//     const pdfBuffer = await page.pdf({
//       format: "A5",
//       printBackground: true,
//       margin: { top: "8mm", right: "8mm", bottom: "8mm", left: "8mm" },
//     });

//     return pdfBuffer;
//   } finally {
//     await browser.close();
//   }
// }

async function generatePdfBuffer(html) {
  const executablePath =
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    process.env.CHROME_PATH ||
    "/snap/bin/chromium"; // fallback

  const browser = await puppeteer.launch({
    headless: "new",
    executablePath,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-zygote",
      "--single-process",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    return await page.pdf({
      format: "A5",
      printBackground: true,
      margin: { top: "8mm", right: "8mm", bottom: "8mm", left: "8mm" },
    });
  } finally {
    await browser.close();
  }
}

export default custController;
