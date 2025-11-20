import AppError from "../errors/AppError.js";
import { Cart } from "../model/cart.model.js";
import { Product } from "../model/product.model.js";
import { User } from "../model/user.model.js";
import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";
import httpStatus from "http-status";

const calculateDeliveryFee = async (userId, addressIndex, subtotal) => {
  const user = await User.findById(userId);

  const address = user.addresses?.[addressIndex];

  const country = address?.country || "Kuwait";

  let deliveryFee = 0;

  // Apply 0.05% over Kuwait
  if (country.toLowerCase() === "kuwait") {
    deliveryFee = subtotal * 0.0005;
  } else {
    deliveryFee = 5;
  }

  return Number(deliveryFee.toFixed(3));
};

export const getCart = catchAsync(async (req, res) => {
  const cart = await Cart.findOne({ customer: req.user._id }).populate(
    "items.product"
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: "Cart retrieved successfully",
    success: true,
    data: cart || { items: [], subtotal: 0, deliveryFee: 0, total: 0 },
  });
});

export const addToCart = catchAsync(async (req, res) => {
  const {
    productId,
    quantity = 1,
    variant = {},
    specialRequest = "",
  } = req.body;

  if (!productId || quantity < 1) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Product ID and quantity required"
    );
  }

  const product = await Product.findById(productId);
  if (!product || product.stock < quantity) {
    throw new AppError(httpStatus.NOT_FOUND, "Product not available");
  }

  if (product.options.length > 0 && !variant.title) {
    throw new AppError(httpStatus.BAD_REQUEST, "Select variant");
  }

  const price =
    variant.price || product.basePrice * (1 - product.discountPercent / 100);

  let cart = await Cart.findOne({ customer: req.user._id });

  if (!cart) {
    cart = new Cart({
      customer: req.user._id,
      items: [{ product: productId, variant, quantity, price, specialRequest }],
    });
  } else {
    const existingIndex = cart.items.findIndex(
      (item) =>
        item.product.toString() === productId &&
        JSON.stringify(item.variant) === JSON.stringify(variant)
    );

    if (existingIndex > -1) {
      cart.items[existingIndex].quantity += quantity;
    } else {
      cart.items.push({
        product: productId,
        variant,
        quantity,
        price,
        specialRequest,
      });
    }
  }

  await cart.save();

  const populated = await Cart.findById(cart._id).populate(
    "items.product",
    "name basePrice images options discountPercent"
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: "Added to cart",
    success: true,
    data: populated,
  });
});

export const updateCartItem = catchAsync(async (req, res) => {
  const { productId, quantity, variant = {}, specialRequest = "" } = req.body;

  const cart = await Cart.findOne({ customer: req.user._id });

  if (!cart) throw new AppError(httpStatus.NOT_FOUND, "Cart not found");

  const index = cart.items.findIndex(
    (item) =>
      item.product.toString() === productId &&
      JSON.stringify(item.variant) === JSON.stringify(variant)
  );

  if (index === -1) throw new AppError(httpStatus.NOT_FOUND, "Item not found");

  if (quantity <= 0) {
    cart.items.splice(index, 1);
  } else {
    cart.items[index].quantity = quantity;
    cart.items[index].specialRequest = specialRequest;
  }

  await cart.save();

  const updated = await Cart.findById(cart._id).populate("items.product");

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: "Cart updated",
    success: true,
    data: updated,
  });
});

export const removeCartItem = catchAsync(async (req, res) => {
  const { productId } = req.params;

  const cart = await Cart.findOne({ customer: req.user._id });

  if (!cart) throw new AppError(httpStatus.NOT_FOUND, "Cart not found");

  const index = cart.items.findIndex(
    (item) => item.product.toString() === productId
  );

  if (index === -1) throw new AppError(httpStatus.NOT_FOUND, "Item not found");

  cart.items.splice(index, 1);

  await cart.save();

  const updated = await Cart.findById(cart._id).populate("items.product");

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: "Item removed",
    success: true,
    data: updated,
  });
});

export const clearCart = catchAsync(async (req, res) => {
  const cart = await Cart.findOne({ customer: req.user._id });

  if (cart) {
    cart.items = [];
    cart.subtotal = 0;
    cart.deliveryFee = 0;
    cart.total = 0;
    await cart.save();
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: "Cart cleared",
    success: true,
    data: { items: [], subtotal: 0, deliveryFee: 0, total: 0 },
  });
});

export const calculateCheckout = catchAsync(async (req, res) => {
  const { addressIndex = 0 } = req.body;

  const cart = await Cart.findOne({ customer: req.user._id }).populate(
    "items.product"
  );

  if (!cart || cart.items.length === 0)
    throw new AppError(httpStatus.BAD_REQUEST, "Cart empty");

  const deliveryFee = await calculateDeliveryFee(
    req.user._id,
    addressIndex,
    cart.subtotal
  );

  cart.deliveryFee = deliveryFee;
  await cart.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: "Totals calculated",
    success: true,
    data: {
      subtotal: cart.subtotal,
      deliveryFee,
      total: cart.total,
      tax: 0,
    },
  });
});
