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


// ============================================================
// ✅ NEW SYNC ROUTES (Upsert Logic)
// These routes handle the "Update if exists, Insert if new" logic
// based on the composite keys (comp_code + item_code/cust_code/user_id)
// ============================================================

router.post("/sync-itemmast", auth, custController.syncItemMast);
router.post("/sync-custmast", auth, custController.syncCustMast);
router.post("/sync-usermast", auth, custController.syncUserMast);

// ============================================================




// ✅ clean duplicates (recommended)
router.post("/deletecompmast", custController.deleteCompMast);
router.post("/deleteitemmast", custController.deleteItemMast);

export default router;
