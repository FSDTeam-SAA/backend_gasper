import httpStatus from 'http-status';
import { Wishlist } from '../model/wishlist.model.js';
import sendResponse from '../utils/sendResponse.js';
import catchAsync from '../utils/catchAsync.js';

export const addToWishlist = catchAsync(async (req, res) => {
  const { shopifyProductId } = req.body;
  const userId = req.user._id;

  let wishlist = await Wishlist.findOne({ user: userId });

  if (!wishlist) {
    wishlist = await Wishlist.create({ user: userId, products: [shopifyProductId] });
  } else if (!wishlist.products.includes(String(shopifyProductId))) {
    wishlist.products.push(String(shopifyProductId));
    await wishlist.save();
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Added to wishlist',
    data: wishlist,
  });
});

export const getWishlist = catchAsync(async (req, res) => {
  const wishlist = await Wishlist.findOne({ user: req.user._id });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Wishlist fetched',
    data: wishlist || { products: [] },
  });
});

export const removeFromWishlist = catchAsync(async (req, res) => {
  const wishlist = await Wishlist.findOneAndUpdate(
    { user: req.user._id },
    { $pull: { products: req.params.productId } },
    { new: true }
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Removed from wishlist',
    data: wishlist,
  });
});
