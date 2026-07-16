import httpStatus from "http-status";
import { User } from "../model/user.model.js";
import { uploadOnCloudinary } from "../utils/commonMethod.js";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import {
  fetchCurrentShopifyCustomer,
  updateCurrentShopifyCustomer,
} from "../utils/shopify.customer.service.js";

function safeUser(user) {
  const data = user.toObject();
  delete data.password;
  delete data.refreshToken;
  delete data.verificationInfo;
  delete data.password_reset_token;
  delete data.shopifyCustomerAccessToken;
  delete data.shopifyCustomerRefreshToken;
  delete data.shopifyCustomerIdToken;
  delete data.shopifyCustomerAccessTokenExpiresAt;
  return data;
}

function applyShopifyCustomer(user, customer) {
  user.shopifyCustomerId = customer.id;
  user.firstName = customer.firstName;
  user.lastName = customer.lastName;
  user.name = customer.displayName;
  user.email = customer.email;
  if (customer.phone) user.phone = customer.phone;

  const address = customer.defaultAddress;
  if (address) {
    user.address = [address.address1, address.address2].filter(Boolean).join(", ");
    user.city = address.city;
    user.postalCode = address.zip;
    user.country = address.country;
  }
}

function profileResponse(user, shopifyCustomer) {
  const data = safeUser(user);
  if (!shopifyCustomer) return data;

  data.firstName = shopifyCustomer.firstName;
  data.lastName = shopifyCustomer.lastName;
  data.name = shopifyCustomer.displayName;
  data.email = shopifyCustomer.email;
  data.phone = shopifyCustomer.phone || data.phone || "";
  data.shopifyCustomer = shopifyCustomer;
  if (!data.avatar?.url && shopifyCustomer.imageUrl) {
    data.avatar = { public_id: "shopify", url: shopifyCustomer.imageUrl };
  }
  return data;
}

export const getProfile = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id);
  let shopifyCustomer;
  if (user.authProvider === "shopify") {
    shopifyCustomer = await fetchCurrentShopifyCustomer(user._id);
    applyShopifyCustomer(user, shopifyCustomer);
    await user.save();
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Profile fetched",
    data: profileResponse(user, shopifyCustomer),
  });
});

export const updateProfile = catchAsync(async (req, res) => {
  const {
    name,
    firstName,
    lastName,
    phone,
    address,
    addressId,
    address1,
    address2,
    city,
    province,
    zoneCode,
    countryCode,
    postalCode,
    nationality,
  } = req.body;

  const user = await User.findById(req.user._id);

  let shopifyCustomer;
  if (user.authProvider === "shopify") {
    const fallbackNames = String(name || "").trim().split(/\s+/);
    const resolvedFirstName = firstName ?? fallbackNames.shift() ?? user.firstName;
    const resolvedLastName =
      lastName ?? (fallbackNames.length ? fallbackNames.join(" ") : user.lastName);

    const shopifyInput = {
      firstName: resolvedFirstName,
      lastName: resolvedLastName,
    };
    const resolvedAddress1 = address1 ?? address;
    if (resolvedAddress1) {
      shopifyInput.address = {
        id: addressId || undefined,
        firstName: resolvedFirstName,
        lastName: resolvedLastName,
        address1: resolvedAddress1,
        address2,
        city,
        zoneCode: zoneCode || province,
        territoryCode: countryCode,
        zip: postalCode,
        phoneNumber: phone,
      };
    }

    shopifyCustomer = await updateCurrentShopifyCustomer(user._id, shopifyInput);
    applyShopifyCustomer(user, shopifyCustomer);
  } else {
    if (name) user.name = name;
    if (phone) user.phone = phone;
    if (address) user.address = address;
  }

  if (nationality) user.nationality = nationality;

  if (req.file) {
    const upload = await uploadOnCloudinary(req.file.buffer);
    user.avatar = { public_id: upload.public_id, url: upload.secure_url };
  }

  await user.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Updated",
    data: profileResponse(user, shopifyCustomer),
  });
});

export const changePassword = catchAsync(async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;

  if (newPassword !== confirmPassword)
    throw new AppError(httpStatus.BAD_REQUEST, "Passwords don't match");

  const user = await User.findById(req.user._id).select("+password");

  if (!(await User.isPasswordMatched(currentPassword, user.password))) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Current password wrong");
  }
  user.password = newPassword;

  await user.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Password changed",
  });
});
