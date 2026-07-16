import express from "express";
import {
  addToCart,
  getCart,
  updateCart,
  clearCart,
  getCheckout,
} from "../controller/cart.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/add", protect, addToCart);
router.get("/", protect, getCart);
router.put("/update", protect, updateCart);
router.delete("/clear", protect, clearCart);
router.post("/checkout", protect, getCheckout);

export default router;
