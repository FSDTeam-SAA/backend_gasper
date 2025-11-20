import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import upload from "../middleware/multer.middleware.js";
import {
  createOffer,
  deleteOffer,
  getAllOffers,
  updateOffer,
} from "../controller/offer.controller.js";

const router = express.Router();

router.get("/", protect, getAllOffers);
router.post("/", protect, upload.single("image"), createOffer);
router.put("/:id", protect, upload.single("image"), updateOffer);
router.delete("/:id", protect, deleteOffer);

export default router;
