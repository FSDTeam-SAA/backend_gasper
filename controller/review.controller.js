import httpStatus from 'http-status';
import { User } from '../model/user.model.js';
import AppError from '../errors/AppError.js';
import catchAsync from '../utils/catchAsync.js';
import sendResponse from '../utils/sendResponse.js';
import { fetchProductById } from '../utils/shopify.service.js';

export const addReview = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { productId, rating, text } = req.body;

  if (!productId || rating === undefined) {
    throw new AppError(httpStatus.BAD_REQUEST, 'productId and rating are required');
  }
  if (rating < 0 || rating > 5) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Rating must be between 0 and 5');
  }

  const product = await fetchProductById(productId);
  if (!product) throw new AppError(httpStatus.NOT_FOUND, 'Product not found');

  const user = await User.findById(userId);
  if (!user) throw new AppError(httpStatus.NOT_FOUND, 'User not found');

  const already = user.review?.some(r => r.product === String(productId));
  if (already) {
    throw new AppError(httpStatus.BAD_REQUEST, 'You already reviewed this product');
  }

  user.review.push({ rating: Number(rating), product: String(productId), text: text || '' });
  await user.save();

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Review added successfully',
  });
});

export const updateMyReview = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { productId } = req.params;
  const { rating, text } = req.body;

  const user = await User.findById(userId);
  if (!user) throw new AppError(httpStatus.NOT_FOUND, 'User not found');

  const review = user.review.find(r => r.product === String(productId));
  if (!review) throw new AppError(httpStatus.NOT_FOUND, 'Review not found');

  if (rating !== undefined) {
    if (rating < 0 || rating > 5) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Rating must be between 0 and 5');
    }
    review.rating = Number(rating);
  }
  if (text !== undefined) review.text = text;

  await user.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Review updated successfully',
  });
});

export const deleteMyReview = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { productId } = req.params;

  const user = await User.findById(userId);
  if (!user) throw new AppError(httpStatus.NOT_FOUND, 'User not found');

  const before = user.review.length;
  user.review = user.review.filter(r => r.product !== String(productId));

  if (user.review.length === before) {
    throw new AppError(httpStatus.NOT_FOUND, 'Review not found');
  }

  await user.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Review deleted successfully',
  });
});

export const getProductReviews = catchAsync(async (req, res) => {
  const { productId } = req.params;
  const { page = 1, limit = 10 } = req.query;

  const pageNum = Number(page);
  const limitNum = Number(limit);
  const skip = (pageNum - 1) * limitNum;

  const rows = await User.aggregate([
    { $match: { 'review.product': String(productId) } },
    { $project: { name: 1, storeName: 1, avatar: 1, review: 1 } },
    { $unwind: '$review' },
    { $match: { 'review.product': String(productId) } },
    { $sort: { 'review._id': -1 } },
    {
      $facet: {
        data: [
          { $skip: skip },
          { $limit: limitNum },
          {
            $project: {
              _id: 0,
              user: { _id: '$_id', name: '$name', storeName: '$storeName', avatar: '$avatar' },
              rating: '$review.rating',
              text: '$review.text',
              product: '$review.product',
              reviewId: '$review._id',
            },
          },
        ],
        total: [{ $count: 'count' }],
      },
    },
  ]);

  const reviews = rows?.[0]?.data || [];
  const total = rows?.[0]?.total?.[0]?.count || 0;

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Product reviews fetched',
    data: { reviews, pagination: { total, page: pageNum, limit: limitNum } },
  });
});

export const getMyReviews = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id).lean();
  if (!user) throw new AppError(httpStatus.NOT_FOUND, 'User not found');

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'My reviews fetched',
    data: { reviews: user.review || [] },
  });
});
