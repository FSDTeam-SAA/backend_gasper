import httpStatus from 'http-status';
import AppError from '../errors/AppError.js';
import sendResponse from '../utils/sendResponse.js';
import catchAsync from '../utils/catchAsync.js';
import {
  createShopifyOrder,
  fetchOrdersByEmail,
  fetchOrderById,
  cancelShopifyOrder,
} from '../utils/shopify.service.js';

export const createOrder = catchAsync(async (req, res) => {
  const { items, address, note } = req.body;
  // items: [{ variantId, quantity }]

  if (!items || !items.length) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Order must have at least one item');
  }
  if (!address) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Shipping address is required');
  }

  const order = await createShopifyOrder({
    email: req.user.email,
    lineItems: items,
    shippingAddress: address,
    note,
  });

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Order created',
    data: order,
  });
});

export const getOrders = catchAsync(async (req, res) => {
  const { status } = req.query;

  // Admin sees all orders, users see only their own
  const email = req.user.role === 'admin' ? undefined : req.user.email;

  const orders = await fetchOrdersByEmail(email || '', {
    status: status || 'any',
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Orders fetched',
    data: orders,
  });
});

export const getOrderById = catchAsync(async (req, res) => {
  const order = await fetchOrderById(req.params.orderId);
  if (!order) throw new AppError(httpStatus.NOT_FOUND, 'Order not found');

  if (req.user.role === 'user' && order.email !== req.user.email) {
    throw new AppError(httpStatus.FORBIDDEN, 'Access denied');
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Order fetched',
    data: order,
  });
});

export const cancelOrder = catchAsync(async (req, res) => {
  const order = await cancelShopifyOrder(req.params.orderId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Order cancelled',
    data: order,
  });
});
