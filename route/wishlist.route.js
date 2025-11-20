import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  addToWishlist,
  getWishlist,
  removeFromWishlist,
} from "../controller/wishlist.controller.js";

const router = express.Router();

router.get("/", protect, getWishlist);
router.post("/add", protect, addToWishlist);
router.delete("/remove/:productId", protect, removeFromWishlist);

export default router;
