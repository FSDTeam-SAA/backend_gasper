import express from 'express';
import {
  getProducts,
  getProductsByBrand,
  getAllBrands,
  getProductById,
  newArrivals,
} from '../controller/product.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/', protect, getProducts);
router.get('/brands', protect, getAllBrands);
router.get('/new-arrivals', protect, newArrivals);
router.get('/brand/:brandName', protect, getProductsByBrand);
router.get('/:id', protect, getProductById);

export default router;
