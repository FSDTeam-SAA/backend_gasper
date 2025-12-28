import express from "express";
import {
  createPayment,
  confirmPayment,
} from "../controller/payment.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

// Create Payment
router.post("/create-payment", protect, createPayment);

// Capture Payment
router.post("/confirm-payment", protect, confirmPayment);

export default router;
