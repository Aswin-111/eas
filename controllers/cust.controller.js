import mongoose from "mongoose";

import custMast from "../models/CustMast.js"; // Assuming you have a models directory for database operations

import ItemMast from "../models/ItemMast.js";

import OrdMast from "../models/OrdMast.js";
import OrdTrxfile from "../models/OrdTrxfile.js";
import pdfkit from "pdfkit";
import fs from "fs";
import CustMast from "../models/CustMast.js";

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
        const { comp_code, user_id, order_details } = req.body;

        // 1. Generate Order Number
        const lastOrder = await OrdMast.findOne({ comp_code })
          .sort({ ord_no: -1 })
          .lean();

        const ord_no = lastOrder ? lastOrder.ord_no + 1 : 1;

        // 2. Calculate Total Amount
        const totalAmount = order_details.reduce(
          (sum, item) => sum + item.subtotal,
          0
        );

        // 3. Create Order Master
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

        // 4. Create Transaction Items
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

        // 5. Save Everything without transactions
        await ordMast.save();
        await OrdTrxfile.insertMany(trxItems);

        // 6. Generate HTML Bill
        const htmlBill = generateHTMLBill(comp_code, ord_no, ordMast, trxItems);

        // 7. Generate PDF from HTML
        const pdfDoc = new pdfkit();
        pdfDoc.pipe(fs.createWriteStream(`bills/bill_${ord_no}.pdf`)); // Save PDF to file

        // You can't directly convert HTML to PDF with pdfkit, so you might need to use an HTML to PDF library like puppeteer or pdfmake.
        // Here's a simplified example using pdfkit for text output:
        pdfDoc.fontSize(15).text(htmlBill, 100, 100);
        pdfDoc.end();

        // Send PDF as response
        res.set(
          "Content-Disposition",
          `attachment; filename="bill_${ord_no}.pdf"`
        );
        res.set("Content-Type", "application/pdf");
        fs.createReadStream(`bill_${ord_no}.pdf`).pipe(res);

        // Alternatively, if you want to send it directly without saving to disk:
        // const pdfBuffer = await generatePdfBuffer(htmlBill); // Implement generatePdfBuffer using an HTML to PDF library
        // res.set("Content-Disposition", `attachment; filename="bill_${ord_no}.pdf"`);
        // res.set("Content-Type", "application/pdf");
        // res.send(pdfBuffer);
      } catch (error) {
        console.error("Order Error:", error);
        res.status(500).json({
          message: "Order failed",
          error: error.message,
        });
      }
    },
  };

  function generateHTMLBill(comp_code, ord_no, orderMaster, orderItems) {
    // Calculate total tax
    const totalTax = orderItems.reduce(
      (sum, item) => sum + (item.item_tax || 0),
      0
    );

    // Generate item rows
    const itemRows = orderItems
      .map(
        (item) => `
      <tr>
        <td>${item.line_no}</td>
        <td>${item.item_name}</td>
        <td>${item.item_qty}</td>
        <td>$${item.item_price.toFixed(2)}</td>
        <td>$${item.trx_total.toFixed(2)}</td>
      </tr>
    `
      )
      .join("");

    // Create the HTML invoice
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Invoice #${ord_no}</title>
        <style>
          body {
            font-family: 'Helvetica', Arial, sans-serif;
            margin: 0;
            padding: 0;
            color: #333;
            background-color: #f9f9f9;
          }
          .invoice-container {
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background-color: #fff;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
          }
          .invoice-header {
            text-align: center;
            margin-bottom: 20px;
            padding-bottom: 20px;
            border-bottom: 1px solid #eee;
          }
          .company-details {
            margin-bottom: 30px;
          }
          .order-info {
            margin-bottom: 30px;
          }
          .order-info h3 {
            border-bottom: 1px solid #eee;
            padding-bottom: 10px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
          }
          th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #eee;
          }
          th {
            background-color: #f8f8f8;
          }
          .totals {
            margin-top: 30px;
            text-align: right;
          }
          .totals .total-row {
            display: flex;
            justify-content: flex-end;
            margin-bottom: 5px;
          }
          .totals .label {
            width: 150px;
            text-align: right;
            padding-right: 20px;
          }
          .totals .grand-total {
            font-weight: bold;
            font-size: 18px;
            margin-top: 15px;
            padding-top: 15px;
            border-top: 2px solid #eee;
          }
          .footer {
            margin-top: 50px;
            text-align: center;
            color: #777;
            font-size: 14px;
          }
          @media print {
            body {
              background-color: #fff;
            }
            .invoice-container {
              box-shadow: none;
            }
          }
        </style>
      </head>
      <body>
        <div class="invoice-container">
          <div class="invoice-header">
            <h1>INVOICE</h1>
          </div>
          
          <div class="company-details">
            <h2>Your Company Name</h2>
            <p>123 Business Street</p>
            <p>City, State ZIP</p>
            <p>Phone: (123) 456-7890</p>
            <p>Email: contact@yourcompany.com</p>
          </div>
          
          <div class="order-info">
            <h3>Order Information</h3>
            <p><strong>Order Number:</strong> ${ord_no}</p>
            <p><strong>Order Date:</strong> ${orderMaster.ord_date}</p>
            <p><strong>Order Time:</strong> ${orderMaster.ord_time}</p>
            <p><strong>Customer ID:</strong> ${orderMaster.act_code}</p>
          </div>
          
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Description</th>
                <th>Qty</th>
                <th>Price</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              ${itemRows}
            </tbody>
          </table>
          
          <div class="totals">
            <div class="total-row">
              <div class="label">Subtotal:</div>
              <div class="amount">$${orderMaster.trx_total.toFixed(2)}</div>
            </div>
            <div class="total-row">
              <div class="label">Tax:</div>
              <div class="amount">$${totalTax.toFixed(2)}</div>
            </div>
            <div class="total-row grand-total">
              <div class="label">Total:</div>
              <div class="amount">$${orderMaster.trx_netamount.toFixed(2)}</div>
            </div>
          </div>
          
          <div class="footer">
            <p>Thank you for your business!</p>
            <p>Payment is due within 30 days.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

export default custController;
