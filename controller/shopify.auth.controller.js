import httpStatus from "http-status";
import AppError from "../errors/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";
import { createToken } from "../utils/authToken.js";
import { User } from "../model/user.model.js";
import {
  createAuthorizationRequest,
  createLogoutUrl,
  exchangeAuthorizationCode,
  fetchShopifyCustomer,
  storeShopifyCustomerTokens,
} from "../utils/shopify.customer.service.js";

async function upsertShopifyUser(customer) {
  if (!customer.id || !customer.email) {
    throw new AppError(422, "Shopify customer did not provide an id and email");
  }

  let user = await User.findOne({ shopifyCustomerId: customer.id });
  if (!user) user = await User.findOne({ email: customer.email });

  if (!user) {
    user = new User({
      email: customer.email,
      firstName: customer.firstName,
      lastName: customer.lastName,
      name: customer.displayName || `${customer.firstName} ${customer.lastName}`.trim(),
      phone: customer.phone,
      shopifyCustomerId: customer.id,
      authProvider: "shopify",
      isEmailVerified: true,
      role: "user",
    });
  } else {
    user.shopifyCustomerId = customer.id;
    user.authProvider = "shopify";
    user.isEmailVerified = true;
    if (customer.firstName) user.firstName = customer.firstName;
    if (customer.lastName) user.lastName = customer.lastName;
    if (customer.displayName) user.name = customer.displayName;
    if (customer.phone) user.phone = customer.phone;
  }

  await user.save();
  return user;
}

async function issueAppTokens(user, res) {
  const jwtPayload = { _id: user._id, email: user.email, role: user.role };
  const accessToken = createToken(
    jwtPayload,
    process.env.JWT_ACCESS_SECRET,
    process.env.JWT_ACCESS_EXPIRES_IN
  );
  const refreshToken = createToken(
    jwtPayload,
    process.env.JWT_REFRESH_SECRET,
    process.env.JWT_REFRESH_EXPIRES_IN
  );

  user.refreshToken = refreshToken;
  await user.save();

  res.cookie("refreshToken", refreshToken, {
    secure: true,
    httpOnly: true,
    sameSite: "none",
    maxAge: 1000 * 60 * 60 * 24 * 365,
  });

  return {
    accessToken,
    refreshToken,
    role: user.role,
    _id: user._id,
  };
}

export const authorizeShopifyCustomer = catchAsync(async (req, res) => {
  const authorization = await createAuthorizationRequest();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Shopify authorization URL created",
    data: authorization,
  });
});

export const completeShopifyCustomerAuth = catchAsync(async (req, res, next) => {
  const { code, state, error, error_description: errorDescription } = {
    ...req.query,
    ...req.body,
  };

  if (error) {
    return next(
      new AppError(400, `Shopify authorization failed: ${errorDescription || error}`)
    );
  }

  const tokenData = await exchangeAuthorizationCode({ code, state });
  const customer = await fetchShopifyCustomer(tokenData.access_token);
  const user = await upsertShopifyUser(customer);
  await storeShopifyCustomerTokens(user._id, tokenData);
  const appTokens = await issueAppTokens(user, res);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Shopify customer authenticated successfully",
    data: {
      ...appTokens,
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        shopifyCustomerId: user.shopifyCustomerId,
      },
    },
  });
});

export const createShopifyLogout = catchAsync(async (req, res) => {
  const { idTokenHint, postLogoutRedirectUri } = req.body;
  const logoutUrl = createLogoutUrl({
    idTokenHint,
    postLogoutRedirectUri,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Shopify logout URL created",
    data: { logoutUrl },
  });
});
