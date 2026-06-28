import httpStatus from "http-status";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import {
  fetchCategoriesWithProducts,
  fetchActiveCollections,
} from "../utils/shopify.service.js";

export const getCategories = catchAsync(async (req, res) => {
  // Categories are sourced from active (published) Shopify collections
  const categories = await fetchActiveCollections();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Categories fetched successfully",
    data: categories,
  });
});

export const getCategoryTree = catchAsync(async (req, res) => {
  // Single Shopify call — no per-category requests, no rate limit risk
  const tagMap = await fetchCategoriesWithProducts();
  const tree = Object.entries(tagMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, products]) => ({
      name,
      productCount: products.length,
      products,
    }));

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Category tree fetched successfully",
    data: tree,
  });
});

export const addCategory = catchAsync(async (req, res) => {
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: false,
    message: "Categories are managed via Shopify tags. Use Shopify admin to manage categories.",
    data: null,
  });
});

export const updateCategory = catchAsync(async (req, res) => {
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: false,
    message: "Categories are managed via Shopify tags. Use Shopify admin to manage categories.",
    data: null,
  });
});

export const deleteCategory = catchAsync(async (req, res) => {
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: false,
    message: "Categories are managed via Shopify tags. Use Shopify admin to manage categories.",
    data: null,
  });
});
