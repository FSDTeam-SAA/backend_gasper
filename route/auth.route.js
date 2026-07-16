import express from "express";
import {
  changePassword,
  forgetPassword,
  login,
  logout,
  refreshToken,
  register,
  resetPassword,
  verifyOTP,
} from "../controller/auth.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import {
  authorizeShopifyCustomer,
  completeShopifyCustomerAuth,
  createShopifyLogout,
} from "../controller/shopify.auth.controller.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/verify", verifyOTP);
router.post("/forget", forgetPassword);
router.post("/reset-password", resetPassword);
router.post("/change-password", protect, changePassword);
router.post("/refresh-token", refreshToken);
router.post("/logout", protect, logout);

// Additive Shopify Customer Account OAuth endpoints. Existing local auth
// endpoints remain available until the Flutter client is migrated.
router.get("/shopify/authorize", authorizeShopifyCustomer);
router.all("/shopify/callback", completeShopifyCustomerAuth);
router.post("/shopify/logout-url", createShopifyLogout);

export default router;
