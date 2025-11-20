import express from "express";

import {
  createProduct,
  deleteProduct,
  getCategoryProducts,
  getProductById,
  getProducts,
  updateProduct,
} from "../controller/product.controller.js";

import { protect } from "../middleware/auth.middleware.js";
import upload from "../middleware/multer.middleware.js";

const router = express.Router();
router.use(protect);

router.get("/", getProducts);
router.get("/category/:categoryId", getCategoryProducts);
router.get("/:productId", getProductById);
router.post("/", upload.array("images", 6), createProduct);
router.put("/:productId", upload.array("images", 6), updateProduct);
router.delete("/:productId", deleteProduct);

export default router;
