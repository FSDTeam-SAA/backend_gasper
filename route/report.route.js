import express from "express";
import {
  createReport,
  getAllReports,
  getReportById,
  handleReport,
  deleteReport,
} from "../controller/report.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import upload from "../middleware/multer.middleware.js";

const router = express.Router();

router.post("/", protect, upload.single("attachment"), createReport);
router.get("/", getAllReports);
router.get("/:id", protect, getReportById);
router.put("/:id/handle", handleReport);
router.delete("/:id", protect, deleteReport);

export default router;
