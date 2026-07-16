import express from 'express';
import {
  createOrder,
  getOrders,
  getOrderById,
  cancelOrder,
  getCustomerOrderHistory,
  getCustomerOrder,
} from '../controller/order.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

router.post('/create', protect, createOrder);
router.get('/history', protect, getCustomerOrderHistory);
router.get('/history/:orderId', protect, getCustomerOrder);
router.get('/', protect, getOrders);
router.get('/:orderId', protect, getOrderById);
router.post('/:orderId/cancel', protect, cancelOrder);

export default router;
