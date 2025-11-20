import express from "express";

import { getDashboard } from "../controller/user.controller.js";

import { protect } from "../middleware/auth.middleware.js";
const router = express.Router();

router.use(protect);

router.get("/", getDashboard);

export default router;
