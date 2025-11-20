import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import { createChat, deleteMessage, getChatForUser, getSingleChat, sendMessage, updateMessage } from "../controller/chat.controller.js";

const router = express.Router();

router.post("/create-chat", protect, createChat);
router.post("/send-message", protect, sendMessage);
router.put("/update", protect, updateMessage);
router.delete("/remove", protect, deleteMessage);
router.get("/get-chat", protect, getChatForUser);
router.get("/get-single-chat/:chatId", protect, getSingleChat);
// router.get("/get-chat-farm/:farmId", protect, getChatForFarm);

export default router;
