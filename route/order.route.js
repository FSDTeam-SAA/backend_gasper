import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  cancelOrder,
  checkoutCart,
  getAllOrders,
  getMyOrders,
  getOrderDetails,
  updateOrderStatus,
} from "../controller/order.controller.js";

const router = express.Router();

router.post("/checkout", protect, checkoutCart);
router.get("/my", protect, getMyOrders);
router.get("/", getAllOrders);
router.get("/:orderId", protect, getOrderDetails);
router.put("/:orderId/status", updateOrderStatus);
router.put("/:orderId/cancel", protect, cancelOrder);

export default router;
