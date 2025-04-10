import express from "express";
const router = express.Router();
import { login } from "../controllers/auth.controller.js";
import custController from "../controllers/cust.controller.js";

router.get("/", (req, res) => {
  res.send("Welcome to the API");
});

router.post("/login", login);

router.get("/allcust", custController.getAllCust);
router.post("/shopdetails", custController.getAllShopDetails);
router.post("/orders", custController.orders);

router.post("/addcustdetails", custController.addCustDetails);

router.post("/additemdetails", custController.addItemDetails);

router.post("/addcompdetails", custController.addCompanies);

router.post("/addusers", custController.addUsers);

router.post("/deletecompmast", custController.deleteCompMast);
router.post("/deleteitemmast", custController.deleteItemMast);
router.post("/delete", custController.deleteItemMast);
router.post("/deleteitemmast", custController.deleteItemMast);

export default router;
