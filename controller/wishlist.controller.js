import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import httpStatus from "http-status";
import mongoose from "mongoose";
import { Product } from "../model/product.model.js";
import { Wishlist } from "../model/wishlist.model.js";

export const addToWishlist = catchAsync(async (req, res) => {
  const { productId, variant = {} } = req.body;

  if (!mongoose.Types.ObjectId.isValid(productId))
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid ID");

  const product = await Product.findById(productId);
  if (!product) throw new AppError(httpStatus.NOT_FOUND, "Product not found");

  let wishlist = await Wishlist.findOne({ user: req.user._id });

  if (!wishlist) wishlist = new Wishlist({ user: req.user._id });

  const existing = wishlist.products.find(
    (p) =>
      p.product.toString() === productId &&
      JSON.stringify(p.variant) === JSON.stringify(variant)
  );

  if (existing) throw new AppError(httpStatus.CONFLICT, "Already added");

  wishlist.products.push({ product: productId, variant });

  await wishlist.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Added to wishlist",
    data: wishlist,
  });
});

export const removeFromWishlist = catchAsync(async (req, res) => {
  const { productId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(productId))
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid ID");

  const wishlist = await Wishlist.findOne({ user: req.user._id });

  if (!wishlist) throw new AppError(httpStatus.NOT_FOUND, "Wishlist empty");

  const index = wishlist.products.findIndex(
    (p) => p.product.toString() === productId
  );

  if (index === -1) throw new AppError(httpStatus.NOT_FOUND, "Not in wishlist");

  wishlist.products.splice(index, 1);

  await wishlist.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Removed",
    data: wishlist,
  });
});

export const getWishlist = catchAsync(async (req, res) => {
  const wishlist = await Wishlist.findOne({ user: req.user._id }).populate(
    "products.product",
    "name basePrice images options"
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Wishlist fetched",
    data: wishlist || { products: [] },
  });
});
