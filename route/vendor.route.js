import express from "express";

import { protect } from "../middleware/auth.middleware.js";
import {
  approveVendor,
  becomeVendor,
  getVendorList,
  getInventory,
  getVendorById,
} from "../controller/vendor.controller.js";
import upload from "../middleware/multer.middleware.js";

const router = express.Router();

router.post(
  "/become",
  protect,
  upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "license", maxCount: 1 },
  ]),
  becomeVendor
);

router.get("/", protect, getVendorList);
router.get("/inventory", protect, getInventory);

router.get("/:userId", protect, getVendorById);
router.patch("/:userId/approve", protect, approveVendor);

export default router;
