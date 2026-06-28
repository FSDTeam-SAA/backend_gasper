import httpStatus from "http-status";
import { User } from "../model/user.model.js";
import { uploadOnCloudinary } from "../utils/commonMethod.js";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import { fetchProductsByVendor } from "../utils/shopify.service.js";

export const becomeVendor = catchAsync(async (req, res) => {
  const {
    storeName,
    description,
    phone,
    address,
    city,
    postalCode,
    country,
    taxId,
    passport,
    idCard,
  } = req.body;

  const userId = req.user._id;
  const user = await User.findById(userId);

  let storeLogo = user.avatar;
  if (req.files?.logo) {
    const upload = await uploadOnCloudinary(req.files.logo[0].buffer);
    storeLogo = { public_id: upload.public_id, url: upload.secure_url };
  }

  if (user.role === "manager" && user.vendorStatus === "approved") {
    throw new AppError(httpStatus.BAD_REQUEST, "User is already a vendor");
  }

  let tradeLicense = {};
  if (req.files?.license) {
    const upload = await uploadOnCloudinary(req.files.license[0].buffer);
    tradeLicense = { public_id: upload.public_id, url: upload.secure_url };
  }

  user.role = "manager";
  user.storeName = storeName;
  user.storeDescription = description;
  user.storeLogo = storeLogo;
  user.tradeLicense = tradeLicense;
  user.idCard = idCard;
  user.passport = passport;
  user.taxId = taxId;
  user.address = address;
  user.city = city;
  user.postalCode = postalCode;
  user.country = country;
  user.phone = phone;
  user.vendorStatus = "pending";

  await user.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Vendor application submitted",
    data: user,
  });
});

export const approveVendor = catchAsync(async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req.params.userId,
    { role: "manager", vendorStatus: "approved" },
    { new: true }
  ).select("-password");

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Vendor approved",
    data: user,
  });
});

// Returns this vendor's products from Shopify (matched by storeName = Shopify vendor field)
export const getInventory = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user.storeName) {
    throw new AppError(httpStatus.BAD_REQUEST, "No store name configured for this vendor");
  }

  const products = await fetchProductsByVendor(user.storeName);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Inventory fetched",
    data: products.map(p => ({
      shopifyId: p.shopifyId,
      title: p.title,
      sku: p.sku,
      stock: p.stock,
      status: p.status,
    })),
  });
});

export const getVendorList = catchAsync(async (req, res) => {
  const vendors = await User.find({ role: "manager" }).select(
    "-password -refreshToken"
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Vendors fetched",
    data: vendors,
  });
});

export const getVendorById = catchAsync(async (req, res) => {
  const vendor = await User.findById(req.params.userId).select(
    "-password -refreshToken"
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Vendor fetched",
    data: vendor,
  });
});
