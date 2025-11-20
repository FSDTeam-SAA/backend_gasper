import express from "express";

import {
  createCategory,
  deleteCategory,
  getCategories,
  updateCategory,
} from "../controller/product.category.controller.js";

import upload from "../middleware/multer.middleware.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protect);

router.get("/", getCategories);
router.post("/", upload.single("image"), createCategory);
router.put("/:categoryId", upload.single("image"), updateCategory);
router.delete("/:categoryId", deleteCategory);

export default router;
