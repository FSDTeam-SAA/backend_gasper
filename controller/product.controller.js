import httpStatus from 'http-status';
import AppError from '../errors/AppError.js';
import sendResponse from '../utils/sendResponse.js';
import catchAsync from '../utils/catchAsync.js';
import {
  fetchProducts,
  fetchProductById,
  fetchAllBrands,
  fetchProductsByVendor,
} from '../utils/shopify.service.js';

export const getProducts = catchAsync(async (req, res) => {
  const {
    limit = 20,
    pageInfo,
    category,
    search,
    brand,
    sort,
    minPrice,
    maxPrice,
    type,
  } = req.query;

  let shopifySort = sort;
  if (type === 'featured' || type === 'popular') shopifySort = 'latest';

  const { products: rawProducts, nextPageInfo, prevPageInfo } = await fetchProducts({
    limit,
    pageInfo,
    category,
    brand,
    sort: shopifySort,
  });

  let products = rawProducts;

  if (search) {
    const q = search.toLowerCase();
    products = products.filter(
      p => p.title.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q)
    );
  }
  if (minPrice) products = products.filter(p => p.price >= Number(minPrice));
  if (maxPrice) products = products.filter(p => p.price <= Number(maxPrice));
  if (type === 'featured' || type === 'popular') {
    products = products.filter(p => p.stock > 0);
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Products fetched',
    data: {
      products,
      pagination: { nextPageInfo, prevPageInfo, count: products.length },
    },
  });
});

export const getProductById = catchAsync(async (req, res) => {
  const product = await fetchProductById(req.params.id);
  if (!product) throw new AppError(httpStatus.NOT_FOUND, 'Product not found');

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Product fetched',
    data: product,
  });
});

export const getAllBrands = catchAsync(async (req, res) => {
  const brands = await fetchAllBrands();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Brands fetched successfully',
    data: { brands },
  });
});

export const getProductsByBrand = catchAsync(async (req, res) => {
  const { brandName } = req.params;
  if (!brandName) throw new AppError(httpStatus.BAD_REQUEST, 'Brand name is required');

  const products = await fetchProductsByVendor(brandName);
  if (!products.length) {
    throw new AppError(httpStatus.NOT_FOUND, 'No products found for this brand');
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Products fetched successfully',
    data: products,
  });
});

export const newArrivals = catchAsync(async (req, res) => {
  const { limit = 20, pageInfo } = req.query;

  const { products, nextPageInfo, prevPageInfo } = await fetchProducts({
    limit,
    pageInfo,
    sort: 'latest',
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Products fetched',
    data: { products, pagination: { nextPageInfo, prevPageInfo } },
  });
});
