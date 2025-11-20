import { Order } from "../model/order.model.js";
import { Cart } from "../model/cart.model.js";
import { User } from "../model/user.model.js";
import AppError from "../errors/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import httpStatus from "http-status";
import sendResponse from "../utils/sendResponse.js";

export const checkoutCart = catchAsync(async (req, res) => {
  const {
    addressIndex = 0,
    deliveryTime,
    paymentMethod,
    instructions = "",
  } = req.body;

  const user = await User.findById(req.user._id);

  const address = user.addresses[addressIndex];

  if (!address || !deliveryTime || !paymentMethod) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Address, delivery time, payment method required"
    );
  }

  const cart = await Cart.findOne({ customer: req.user._id }).populate(
    "items.product"
  );

  if (!cart || cart.items.length === 0)
    throw new AppError(httpStatus.BAD_REQUEST, "Cart empty");

  const products = cart.items.map((item) => ({
    product: item.product._id,
    variant: item.variant,
    quantity: item.quantity,
    price: item.price,
    specialRequest: item.specialRequest,
    totalPrice: item.price * item.quantity,
  }));

  const order = new Order({
    customer: req.user._id,
    address: address._id, // Virtual ref
    deliveryInstructions: instructions,
    deliveryTime: new Date(deliveryTime),
    products,
    subtotal: cart.subtotal,
    deliveryFee: cart.deliveryFee,
    totalPrice: cart.total,
    paymentMethod,
  });

  await order.save();

  // Clear cart
  await Cart.findOneAndUpdate(
    { customer: req.user._id },
    { items: [], subtotal: 0, deliveryFee: 0, total: 0 }
  );

  const populated = await Order.findById(order._id).populate(
    "products.product"
  );

  populated.address = address;

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    message: "Order placed",
    success: true,
    data: populated,
  });
});

export const getMyOrders = catchAsync(async (req, res) => {
  const { status, page = 1, limit = 10 } = req.query;

  const filter = { customer: req.user._id };

  if (status) filter.status = status;

  const orders = await Order.find(filter)
    .populate("products.product", "name basePrice images")
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  const user = await User.findById(req.user._id);

  orders.forEach((order) => {
    order.address = user.addresses.id(order.address); // Manual
  });

  const total = await Order.countDocuments(filter);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: "Orders fetched",
    success: true,
    data: {
      orders,
      pagination: { page: Number(page), limit: Number(limit), total },
    },
  });
});

export const getAllOrders = catchAsync(async (req, res) => {
  if (!req.user._id)
    throw new AppError(httpStatus.FORBIDDEN, "You need to pass the token");

  const { status, phone, page = 1, limit = 10 } = req.query;

  const filter = {};
  if (status) filter.status = status;
  if (phone) filter["customer.phone"] = { $regex: phone, $options: "i" };

  const orders = await Order.find(filter)
    .populate("customer", "firstName lastName phone")
    .populate("products.product", "name")
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  orders.forEach((order) => {
    order.address = order.customer.addresses[0];
  });

  const total = await Order.countDocuments(filter);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: "All orders",
    success: true,
    data: {
      orders,
      pagination: { page: Number(page), limit: Number(limit), total },
    },
  });
});

export const updateOrderStatus = catchAsync(async (req, res) => {
  if (!req.user._id)
    throw new AppError(httpStatus.FORBIDDEN, "You need to pass the token");

  const { orderId } = req.params;

  const { status, tracking } = req.body;

  const order = await Order.findById(orderId);

  if (!order) throw new AppError(httpStatus.NOT_FOUND, "Order not found");

  order.status = status;

  if (tracking) order.tracking = tracking;

  await order.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: "Status updated",
    success: true,
    data: order,
  });
});

export const getOrderDetails = catchAsync(async (req, res) => {
  const { orderId } = req.params;

  const order = await Order.findById(orderId).populate(
    "products.product customer"
  );

  if (!order) throw new AppError(httpStatus.NOT_FOUND, "Order not found");

  if (!order.customer.equals(req.user._id) && req.user.role !== "admin") {
    throw new AppError(httpStatus.FORBIDDEN, "Access denied");
  }

  const user = await User.findById(order.customer._id);

  order.address = user.addresses.id(order.address);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: "Order details",
    success: true,
    data: order,
  });
});

export const cancelOrder = catchAsync(async (req, res) => {
  const { orderId } = req.params;

  const order = await Order.findById(orderId);

  if (!order || !order.customer.equals(req.user._id))
    throw new AppError(httpStatus.FORBIDDEN, "Not your order");

  if (["on_way", "delivered"].includes(order.status))
    throw new AppError(httpStatus.BAD_REQUEST, "Cannot cancel");

  order.status = "cancelled";

  if (order.paymentStatus === "paid") order.paymentStatus = "refunded";

  await order.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: "Cancelled",
    success: true,
    data: order,
  });
});
