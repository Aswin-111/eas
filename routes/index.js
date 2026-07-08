import express from "express";
const router = express.Router();


import custController from "../controllers/cust.controller.js";
import auth from "../middleware/auth.js";
import billingAuth from "../middleware/billingAuth.js";
import adminAuth from "../middleware/adminAuth.js";
import deviceWhitelistController from "../controllers/deviceWhitelist.controller.js";
import { login, billingAdminLogin } from "../controllers/auth.controller.js";

router.get("/", (req, res) => {
  res.send("Welcome to the API");
});

router.post("/login", login);
router.post("/billing-admin-sec", billingAdminLogin);

// ✅ Protected routes (comp_code comes from token)

router.get("/users", adminAuth, custController.getAllUsers);
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
router.put("/orders/:ord_no", auth, custController.updateOrderDetails);
router.delete("/orders/:ord_no", auth, custController.deleteOrder);

router.post("/admin/whitelist-device", adminAuth, deviceWhitelistController.addWhitelistedDevice);
router.get("/admin/whitelisted-devices", adminAuth, deviceWhitelistController.getWhitelistedDevices);
router.patch("/admin/whitelisted-devices/:device_id", adminAuth, deviceWhitelistController.editWhitelistedDevice);
router.delete("/admin/whitelisted-devices/:device_id", adminAuth, deviceWhitelistController.removeWhitelistedDevice);
router.get("/admin/allcust", adminAuth, custController.getAllCustAdmin);
router.get("/admin/compcodes", adminAuth, custController.getAllCompCodes);

router.get("/admin/companies", adminAuth, custController.getAllCompanies);


// ============================================================
// ✅ NEW SYNC ROUTES (Upsert Logic)
// These routes handle the "Update if exists, Insert if new" logic
// based on the composite keys (comp_code + item_code/cust_code/user_id)
// ============================================================
router.get("/sync-status/:batch_id", billingAuth, custController.getSyncStatus);
router.post("/sync-itemmast", billingAuth, custController.syncItemMast);
router.post("/sync-custmast", billingAuth, custController.syncCustMast);
router.post("/sync-usermast", adminAuth, custController.syncUserMast);

// ============================================================

// ✅ Get Pending Orders
router.get("/pending-orders", billingAuth, custController.getPendingOrders);
// ✅ Update Order Status
router.post("/update-order-status", billingAuth, custController.updateOrderStatus);

// ✅ clean duplicates (recommended)
router.post("/deletecompmast",billingAuth, custController.deleteCompMast);
router.post("/deleteitemmast",billingAuth, custController.deleteItemMast);

// ✅ VB6 Pull Endpoints (Mongo -> JSON)
router.get("/pull-ordermast", billingAuth, custController.pullOrderMast);
router.get("/pull-ordertrxfile", billingAuth, custController.pullOrderTrxfile);


router.post("/delete-all-custmast", billingAuth, custController.deleteAllCustMast);
router.post("/delete-all-itemmast", billingAuth, custController.deleteAllItemMast);
router.post("/delete-all-usermast", billingAuth, custController.deleteAllUserMast);
export default router;

