import express from "express";
import {
  addToCart,
  getCart,
  updateCart,
  clearCart,
  getCheckout,
  completeCheckout,
  removeCartItem,
} from "../controller/cart.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/add", protect, addToCart);
router.get("/", protect, getCart);
router.post("/update", protect, updateCart);
router.put("/update", protect, updateCart);
router.post("/remove", protect, removeCartItem);
router.delete("/remove", protect, removeCartItem);
router.delete("/clear", protect, clearCart);
router.post("/checkout", protect, getCheckout);
router.post("/checkout/complete", protect, completeCheckout);

export default router;
