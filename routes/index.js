import express from "express";
const router = express.Router();

import { login } from "../controllers/auth.controller.js";
import custController from "../controllers/cust.controller.js";
import auth from "../middleware/auth.js";

router.get("/", (req, res) => {
  res.send("Welcome to the API");
});

router.post("/login", login);

// ✅ Protected routes (comp_code comes from token)
router.get("/allcust", auth, custController.getAllCust);
router.post("/shopdetails", auth, custController.getAllShopDetails);
router.post("/orders", auth, custController.orders);
router.post("/create-customer", auth, custController.createCustomer);
router.get("/order-reports", auth, custController.getOrderReports);
router.get(
  "/orders/:ord_no",
  auth,
  custController.getOrderDetails
);


// admin/seed routes - you decide if protected
router.post("/addcustdetails", auth, custController.addCustDetails);
router.post("/additemdetails", auth, custController.addItemDetails);
router.post("/addcompdetails", auth, custController.addCompanies);
router.post("/addusers", auth, custController.addUsers);


// ✅ clean duplicates (recommended)
router.post("/deletecompmast", custController.deleteCompMast);
router.post("/deleteitemmast", custController.deleteItemMast);

export default router;
