import mongoose from "mongoose";

import custMast from "../models/CustMast.js"; // Assuming you have a models directory for database operations

import ItemMast from "../models/ItemMast.js";

import OrdMast from "../models/OrdMast.js";
import OrdTrxfile from "../models/OrdTrxfile.js";

import fs from "fs";
import CustMast from "../models/CustMast.js";
import puppeteer from "puppeteer";
import pdfkit from "pdfkit";
const custController = {
  getAllCust: async (req, res) => {
    try {
      const { page = 1, limit = 10, area } = req.query; // Get query parameters
      const skip = (page - 1) * limit;

      let query = {}; // Base query
      if (area) {
        if (area !== null && area !== undefined && area !== "") {
          query = { cust_area: area }; // Filter by area if provided
        }
      }

      const customers = await custMast
        .find(query)
        .skip(skip)
        .limit(parseInt(limit));

      const test = await custMast.find({});

      console.log(test);
      const totalCustomers = await custMast.countDocuments(query); // Total matching documents

      if (customers.length > 0) {
        const areas = [...new Set(await custMast.distinct("cust_area"))]; // Get unique areas

        // {
        //   _id: new ObjectId('67b743ed5c59e12e41207b1e'),
        //   comp_code: 1,
        //   cust_code: 1010,
        //   cust_name: 'Metro Stationary',
        //   cust_address: 'Pulinkunnu Junction',
        //   cust_phone: '9098765432',
        //   cust_area: 'Pulinkunnu',
        //   cust_type: 'R',
        //   cust_gst: '0123456789JKLMNOP',
        //   Old_bal: 900,
        //   __v: 0,
        //   createdAt: 2025-02-20T15:02:05.992Z,
        //   updatedAt: 2025-02-20T15:02:05.992Z
        // }
        const responseData = {
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
          areas: areas,
          total: totalCustomers, // Send total count (optional)
        };

        return res.status(200).json(responseData);
      } else {
        return res.status(404).json({ message: "No customers found" });
      }
    } catch (error) {
      return res
        .status(500)
        .json({ message: "Internal server error", error: error.message });
    }
  },
  getAllShopDetails: async (req, res) => {
    try {
      const { comp_code } = req.body;
      const shopDetails = await ItemMast.find({ comp_code: comp_code });
      // console.log(shopDetails, "werty");
      if (shopDetails.length > 0) {
        return res.status(200).json(shopDetails);
      } else {
        return res.status(500).json({ message: "Shops data not found!" });
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

      // Validate each user object against the schema
      for (const user of users) {
        const { comp_code, user_id, user_name, user_password, user_type } =
          user;

        if (!comp_code || !user_id || !user_name) {
          return res.status(400).json({
            message:
              "One or more required fields are missing in a user object.",
          });
        }

        // Additional validation if needed (e.g., password complexity, user type restrictions)
      }

      // Bulk insert the users
      const insertedUsers = await UserMast.insertMany(users);

      res.status(201).json({
        message: "Users created successfully",
        data: insertedUsers,
      });
    } catch (error) {
      console.error("Error creating users:", error);
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
      if (error.code === 11000) {
        // Handle duplicate key error
        return res
          .status(400)
          .json({ message: "Duplicate comp_code and user_id combination." });
      }
      res
        .status(500)
        .json({ message: "Internal server error", error: error.message });
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

 orders : async (req, res) => {
    try {
      const { comp_code, user_id, order_details } = req.body;
  
      const lastOrder = await OrdMast.findOne({ comp_code }).sort({ ord_no: -1 }).lean();
      const ord_no = lastOrder ? lastOrder.ord_no + 1 : 1;
      const totalAmount = order_details.reduce((sum, item) => sum + item.subtotal, 0);
  
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
  
      const trxItems = order_details.map((item, index) => new OrdTrxfile({
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
      }));
  
      await ordMast.save();
      await OrdTrxfile.insertMany(trxItems);
  
      const htmlBill = await generateHTMLBill(comp_code, ord_no, ordMast, trxItems);
      const pdfBuffer = await generatePdfBuffer(htmlBill);
  
      res.set("Content-Disposition", `attachment; filename="bill_${ord_no}.pdf"`);
      res.set("Content-Type", "application/pdf");
      res.send(pdfBuffer);
  
    } catch (error) {
      console.error("Order Error:", error);
      res.status(500).json({ message: "Order failed", error: error.message });
    }
  }
};

async function generateHTMLBill(comp_code, ord_no, ordMast, trxItems) {
  // Fetch company details (assuming you have a CompMast model)
  // const companyDetails = await CompMast.findOne({ comp_code }); // You will have to create this model and import it

  // Construct HTML bill content
  let htmlBill = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Bill - ${ord_no}</title>
      <style>
        body { font-family: sans-serif; margin: 20px; }
        .bill-container { width: 800px; margin: 0 auto; border: 1px solid #ccc; padding: 20px; }
        .bill-header { text-align: center; margin-bottom: 20px; }
        .bill-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        .bill-table th, .bill-table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        .bill-table th { background-color: #f2f2f2; }
        .bill-total { text-align: right; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="bill-container">
        <div class="bill-header"><h1>Invoice</h1></div>
        <p>Order Number: ${ord_no}</p>
        <p>Date: ${ordMast.ord_date}</p>
        <p>Time: ${ordMast.ord_time}</p>
        <table class="bill-table">
          <thead><tr><th>Item</th><th>Quantity</th><th>Price</th><th>Total</th></tr></thead>
          <tbody>
            ${trxItems
              .map(
                (item) => `
              <tr>
                <td>${item.item_name}</td>
                <td>${item.item_qty}</td>
                <td>$${item.item_price.toFixed(2)}</td>
                <td>$${item.trx_total.toFixed(2)}</td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
        <div class="bill-total"><strong>Total: $${ordMast.trx_total.toFixed(
          2
        )}</strong></div>
      </div>
    </body>
    </html>
  `;
  return htmlBill;
}
async function generatePdfBuffer(html) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setContent(html);
  const pdfBuffer = await page.pdf({ format: 'A4' });
  await browser.close();
  return pdfBuffer;
}
export default custController;
