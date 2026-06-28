import httpStatus from 'http-status';
import { Cart as CartModel } from '../model/cart.model.js';
import AppError from '../errors/AppError.js';
import sendResponse from '../utils/sendResponse.js';
import catchAsync from '../utils/catchAsync.js';
import { fetchProductById } from '../utils/shopify.service.js';

export const addToCart = catchAsync(async (req, res) => {
  const { shopifyProductId, variantId, quantity = 1 } = req.body;
  const userId = req.user._id;

  const product = await fetchProductById(shopifyProductId);
  if (!product) throw new AppError(httpStatus.NOT_FOUND, 'Product not found');

  const variant = product.variants.find(v => v.id === String(variantId));
  if (!variant) throw new AppError(httpStatus.BAD_REQUEST, 'Variant not found');
  if (variant.stock < Number(quantity)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Insufficient stock');
  }

  let cart = await CartModel.findOne({ user: userId });

  const newItem = {
    shopifyProductId: String(shopifyProductId),
    variantId: String(variantId),
    quantity: Number(quantity),
    price: variant.price,
    title: product.title,
    image: product.photos[0]?.url || '',
  };

  if (!cart) {
    cart = await CartModel.create({ user: userId, items: [newItem] });
  } else {
    const existing = cart.items.find(
      i => i.shopifyProductId === newItem.shopifyProductId && i.variantId === newItem.variantId
    );
    if (existing) {
      existing.quantity += newItem.quantity;
      existing.price = variant.price;
    } else {
      cart.items.push(newItem);
    }
  }

  cart.totalAmount = cart.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  await cart.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Added to cart',
    data: cart,
  });
});

export const getCart = catchAsync(async (req, res) => {
  const cart = await CartModel.findOne({ user: req.user._id });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Cart fetched',
    data: cart || { items: [], totalAmount: 0 },
  });
});

export const updateCart = catchAsync(async (req, res) => {
  const { shopifyProductId, variantId, quantity } = req.body;
  const cart = await CartModel.findOne({ user: req.user._id });

  if (!cart) throw new AppError(httpStatus.NOT_FOUND, 'Cart not found');

  if (Number(quantity) <= 0) {
    cart.items = cart.items.filter(
      i => !(i.shopifyProductId === String(shopifyProductId) && i.variantId === String(variantId))
    );
  } else {
    const item = cart.items.find(
      i => i.shopifyProductId === String(shopifyProductId) && i.variantId === String(variantId)
    );
    if (!item) throw new AppError(httpStatus.NOT_FOUND, 'Item not in cart');
    item.quantity = Number(quantity);
  }

  cart.totalAmount = cart.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  await cart.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Cart updated',
    data: cart,
  });
});

export const clearCart = catchAsync(async (req, res) => {
  await CartModel.findOneAndUpdate(
    { user: req.user._id },
    { items: [], totalAmount: 0 }
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Cart cleared',
    data: { items: [], totalAmount: 0 },
  });
});
