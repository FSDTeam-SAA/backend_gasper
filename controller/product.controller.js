import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import httpStatus from "http-status";
import mongoose from "mongoose";
import { Product } from "../model/product.model.js";
import { ProductCategory } from "../model/product.category.model.js";
import { uploadOnCloudinary } from "../utils/commonMethod.js";

export const createProduct = catchAsync(async (req, res) => {
  let userId = req.user._id;
  if (!userId)
    throw new AppError(httpStatus.FORBIDDEN, "You need to pass the token");
  const {
    name,
    description,
    basePrice,
    category,
    options = [],
    discountPercent = 0,
    stock = 0,
    variation,
  } = req.body;

  if (!name || !description || !basePrice || !category)
    throw new AppError(httpStatus.BAD_REQUEST, "Required fields missing");

  if (!mongoose.Types.ObjectId.isValid(category))
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid category");

  const cat = await ProductCategory.findById(category);
  if (!cat) throw new AppError(httpStatus.NOT_FOUND, "Category not found");

  if (req.files?.length > 6)
    throw new AppError(httpStatus.BAD_REQUEST, "Max 6 images");

  const images = req.files
    ? (
        await Promise.all(req.files.map((f) => uploadOnCloudinary(f.buffer)))
      ).map((u) => u.secure_url)
    : [];

  const parsedOptions = JSON.parse(options).map((opt) => ({
    title: opt.title,
    price: Number(opt.price),
    quantityType: opt.quantityType,
    stock: Number(opt.stock),
  }));

  const totalStock =
    stock + parsedOptions.reduce((sum, opt) => sum + opt.stock, 0);

  const product = await Product.create({
    name,
    description,
    basePrice: Number(basePrice),
    category,
    options: parsedOptions,
    discountPercent: Number(discountPercent),
    stock: totalStock,
    images,
    variation,
  });

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Product created",
    data: product,
  });
});

export const updateProduct = catchAsync(async (req, res) => {
  let userId = req.user._id;
  if (!userId)
    throw new AppError(httpStatus.FORBIDDEN, "You need to pass the token");

  const { productId } = req.params;

  const {
    name,
    description,
    basePrice,
    category,
    options = [],
    discountPercent = 0,
    stock = 0,
  } = req.body;
  if (!mongoose.Types.ObjectId.isValid(productId))
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid ID");

  const product = await Product.findById(productId);
  if (!product) throw new AppError(httpStatus.NOT_FOUND, "Not found");

  if (category && !mongoose.Types.ObjectId.isValid(category))
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid category");

  const cat = category
    ? await ProductCategory.findById(category)
    : product.category;

  if (category && !cat)
    throw new AppError(httpStatus.NOT_FOUND, "Category not found");

  let images = product.images;
  if (req.files) {
    if (req.files.length > 6)
      throw new AppError(httpStatus.BAD_REQUEST, "Max 6");
    const uploads = await Promise.all(
      req.files.map((f) => uploadOnCloudinary(f.buffer))
    );
    images = uploads.map((u) => u.secure_url);
  }

  const parsedOptions = JSON.parse(options).map((opt) => ({
    title: opt.title,
    price: Number(opt.price),
    quantityType: opt.quantityType,
    stock: Number(opt.stock),
  }));

  const totalStock =
    stock + parsedOptions.reduce((sum, opt) => sum + opt.stock, 0);

  const updated = await Product.findByIdAndUpdate(
    productId,
    {
      name,
      description,
      basePrice: Number(basePrice),
      category,
      options: parsedOptions,
      discountPercent: Number(discountPercent),
      stock: totalStock,
      images,
    },
    { new: true }
  ).populate("category");

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Updated",
    data: updated,
  });
});

export const getProducts = catchAsync(async (req, res) => {
  const {
    search,
    category,
    priceFrom,
    priceTo,
    sort = "newest",
    page = 1,
    limit = 10,
  } = req.query;

  const query = { stock: { $gt: 0 } };

  if (search) query.name = { $regex: search, $options: "i" };

  if (category) {
    const cat = await ProductCategory.findOne({
      name: { $regex: `^${category}$`, $options: "i" },
    });

    if (cat) query.category = cat._id;
    else throw new AppError(httpStatus.NOT_FOUND, "Category not found");
  }

  const priceQ = {};
  if (priceFrom) priceQ.$gte = Number(priceFrom);

  if (priceTo) priceQ.$lte = Number(priceTo);

  if (Object.keys(priceQ).length) query.basePrice = priceQ;

  const sortObj =
    sort === "priceLowToHigh"
      ? { basePrice: 1 }
      : sort === "priceHighToLow"
      ? { basePrice: -1 }
      : { createdAt: -1 };

  const skip = (Number(page) - 1) * Number(limit);

  const products = await Product.find(query)
    .sort(sortObj)
    .skip(skip)
    .limit(Number(limit))
    .populate("category", "name");

  const total = await Product.countDocuments(query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Products fetched",
    data: {
      products,
      pagination: { page: Number(page), limit: Number(limit), total },
    },
  });
});

export const getProductById = catchAsync(async (req, res) => {
  const { productId } = req.params;
  const product = await Product.findById(productId).populate(
    "category",
    "name"
  );

  if (!product) throw new AppError(httpStatus.NOT_FOUND, "Not found");

  const related = await Product.find({
    category: product.category._id,
    _id: { $ne: productId },
    stock: { $gt: 0 },
  })
    .limit(8)
    .populate("category");

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Product details",
    data: { product, relatedProducts: related },
  });
});

export const getCategoryProducts = catchAsync(async (req, res) => {
  const { categoryId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(categoryId))
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid ID");

  const products = await Product.find({
    category: categoryId,
    stock: { $gt: 0 },
  })
    .sort({ createdAt: -1 })
    .populate("category");

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Category products",
    data: products,
  });
});

export const deleteProduct = catchAsync(async (req, res) => {
  let userId = req.user._id;
  if (!userId)
    throw new AppError(httpStatus.FORBIDDEN, "You need to pass the token");

  const { productId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(productId))
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid ID");

  await Product.findByIdAndDelete(productId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Deleted",
  });
});
