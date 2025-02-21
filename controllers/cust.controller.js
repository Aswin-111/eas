import custMast from "../models/CustMast.js"; // Assuming you have a models directory for database operations

import ItemMast from "../models/ItemMast.js";
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
      console.log(shopDetails, "werty");
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
  order: async (req, res) => {
    console.log(req.body);
  
    return res.status(200).json({ message: "Order successfully placed" });
  }
};



export default custController;
