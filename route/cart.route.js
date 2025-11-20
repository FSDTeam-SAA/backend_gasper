import express from "express";

import { protect } from "../middleware/auth.middleware.js";
import {
  addToCart,
  calculateCheckout,
  clearCart,
  getCart,
  removeCartItem,
  updateCartItem,
} from "../controller/cart.controller.js";

const router = express.Router();

router.get("/", protect, getCart);
router.post("/add", protect, addToCart);
router.put("/update", protect, updateCartItem);
router.delete("/remove/:productId", protect, removeCartItem);
router.delete("/clear", protect, clearCart);
router.post("/checkout/calculate", protect, calculateCheckout);

export default router;
