import express from "express";

import authRoute from "../route/auth.route.js";
import userRoute from "../route/user.route.js";
import categoryRoute from "../route/product.category.route.js";
import productRoute from "../route/product.route.js";
import cartRoute from "../route/cart.route.js";
import wishlistRoute from "../route/wishlist.route.js";
import chatRoute from "../route/chat.route.js";
import orderRoute from "../route/order.route.js";
import paymentRoute from "../route/payment.route.js";
import dashboardRoute from "../route/dashboard.route.js";
import reportRoute from "../route/report.route.js";

const router = express.Router();

// Mounting the routes
router.use("/auth", authRoute);
router.use("/user", userRoute);
router.use("/category", categoryRoute);
router.use("/product", productRoute);
router.use("/cart", cartRoute);
router.use("/wishlist", wishlistRoute);
router.use("/chat", chatRoute);
router.use("/order", orderRoute);
router.use("/payment", paymentRoute);
router.use("/dashboard", dashboardRoute);
router.use("/report", reportRoute);

export default router;
