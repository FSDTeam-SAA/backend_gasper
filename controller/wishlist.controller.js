import httpStatus from 'http-status';
import { Wishlist } from '../model/wishlist.model.js';
import sendResponse from '../utils/sendResponse.js';
import catchAsync from '../utils/catchAsync.js';
import AppError from '../errors/AppError.js';
import { fetchProductById } from '../utils/shopify.service.js';

function normalizeProductId(value) {
  const id = String(value || '').trim().split('/').pop();
  if (!id || !/^\d+$/.test(id)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'A valid Shopify product ID is required');
  }
  return id;
}

async function hydrateWishlist(wishlist) {
  if (!wishlist) return { _id: '', products: [] };

  const results = await Promise.allSettled(
    wishlist.products.map((productId) => fetchProductById(productId))
  );
  const products = results
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value);

  return {
    _id: wishlist._id,
    products,
    createdAt: wishlist.createdAt,
    updatedAt: wishlist.updatedAt,
  };
}

export const addToWishlist = catchAsync(async (req, res) => {
  const shopifyProductId = normalizeProductId(
    req.body.shopifyProductId || req.body.product
  );
  const userId = req.user._id;

  // Confirm that the product still exists in Shopify before saving its ID.
  try {
    await fetchProductById(shopifyProductId);
  } catch {
    throw new AppError(httpStatus.NOT_FOUND, 'Shopify product was not found');
  }

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
    data: await hydrateWishlist(wishlist),
  });
});

export const getWishlist = catchAsync(async (req, res) => {
  const wishlist = await Wishlist.findOne({ user: req.user._id });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Wishlist fetched',
    data: await hydrateWishlist(wishlist),
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
    data: await hydrateWishlist(wishlist),
  });
});

export const clearWishlist = catchAsync(async (req, res) => {
  const wishlist = await Wishlist.findOneAndUpdate(
    { user: req.user._id },
    { $set: { products: [] } },
    { new: true }
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Wishlist cleared',
    data: await hydrateWishlist(wishlist),
  });
});
