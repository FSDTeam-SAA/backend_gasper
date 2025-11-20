import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import httpStatus from "http-status";
import mongoose from "mongoose";
import { ProductCategory } from "../model/product.category.model.js";
import { Product } from "../model/product.model.js";
import { uploadOnCloudinary } from "../utils/commonMethod.js";

export const createCategory = catchAsync(async (req, res) => {
  let userId = req.user._id;
  if (!userId)
    throw new AppError(httpStatus.FORBIDDEN, "You need to pass the token");

  const { name, description } = req.body;

  if (!name) throw new AppError(httpStatus.BAD_REQUEST, "Name required");

  const existing = await ProductCategory.findOne({
    name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
  });

  if (existing) throw new AppError(httpStatus.CONFLICT, "Category exists");

  const image = req.file ? await uploadOnCloudinary(req.file.buffer) : null;

  const category = await ProductCategory.create({
    name: name.trim(),
    description: description?.trim(),
    image: image?.secure_url,
  });

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Category created",
    data: category,
  });
});

export const getCategories = catchAsync(async (req, res) => {
  const categories = await ProductCategory.aggregate([
    {
      $lookup: {
        from: "products",
        localField: "_id",
        foreignField: "category",
        as: "products",
      },
    },
    {
      $project: {
        name: 1,
        description: 1,
        image: 1,
        productCount: { $size: "$products" },
      },
    },
    { $sort: { productCount: -1 } },
  ]);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Categories fetched",
    data: categories,
  });
});

export const updateCategory = catchAsync(async (req, res) => {
  let userId = req.user._id;
  if (!userId)
    throw new AppError(httpStatus.FORBIDDEN, "You need to pass the token");

  const { categoryId } = req.params;

  const { name, description } = req.body;

  if (!mongoose.Types.ObjectId.isValid(categoryId))
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid ID");

  const category = await ProductCategory.findById(categoryId);

  if (!category) throw new AppError(httpStatus.NOT_FOUND, "Category not found");

  if (name) category.name = name.trim();

  if (description) category.description = description.trim();

  if (req.file) {
    const image = await uploadOnCloudinary(req.file.buffer);
    category.image = image.secure_url;
  }

  await category.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Updated",
    data: category,
  });
});

export const deleteCategory = catchAsync(async (req, res) => {
  let userId = req.user._id;
  if (!userId)
    throw new AppError(httpStatus.FORBIDDEN, "You need to pass the token");

  const { categoryId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(categoryId))
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid ID");

  const category = await ProductCategory.findById(categoryId);

  if (!category) throw new AppError(httpStatus.NOT_FOUND, "Not found");

  const count = await Product.countDocuments({ category: categoryId });

  if (count > 0) throw new AppError(httpStatus.BAD_REQUEST, "Has products");

  await ProductCategory.findByIdAndDelete(categoryId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Deleted",
  });
});
