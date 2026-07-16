import httpStatus from "http-status";
import { Cart as CartModel } from "../model/cart.model.js";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import {
  addStorefrontCartLines,
  createStorefrontCart,
  getStorefrontCart,
  removeStorefrontCartLines,
  updateStorefrontBuyerIdentity,
  updateStorefrontCartLines,
} from "../utils/shopify.storefront.service.js";

function numericShopifyId(gid) {
  return String(gid || "").split("/").pop();
}

function variantGid(variantId) {
  const value = String(variantId || "");
  return value.startsWith("gid://shopify/ProductVariant/")
    ? value
    : `gid://shopify/ProductVariant/${value}`;
}

function normalizeCart(shopifyCart, userId) {
  const items = (shopifyCart.lines?.nodes || []).map((line) => {
    const variant = line.merchandise || {};
    const product = variant.product || {};
    const unitAmount = Number(line.cost?.amountPerQuantity?.amount || 0);
    const totalAmount = Number(line.cost?.totalAmount?.amount || 0);
    const currencyCode =
      line.cost?.totalAmount?.currencyCode ||
      line.cost?.amountPerQuantity?.currencyCode ||
      "";

    return {
      lineId: line.id,
      shopifyProductId: numericShopifyId(product.id),
      variantId: numericShopifyId(variant.id),
      quantity: Number(line.quantity),
      price: unitAmount,
      total: totalAmount,
      title: product.title || "",
      variantTitle: variant.title === "Default Title" ? "" : variant.title || "",
      image: variant.image?.url || product.featuredImage?.url || "",
      currencyCode,
      quantityAvailable: -1,
      availableForSale: Boolean(variant.availableForSale),
    };
  });

  const totalMoney = shopifyCart.cost?.totalAmount || {};
  const subtotalMoney = shopifyCart.cost?.subtotalAmount || {};

  return {
    user: userId,
    shopifyCartId: shopifyCart.id,
    checkoutUrl: shopifyCart.checkoutUrl || "",
    items,
    totalAmount: Number(totalMoney.amount || 0),
    subtotalAmount: Number(subtotalMoney.amount || 0),
    currencyCode: totalMoney.currencyCode || subtotalMoney.currencyCode || "",
    totalQuantity: Number(shopifyCart.totalQuantity || 0),
  };
}

function emptyCart(userId) {
  return {
    user: String(userId),
    shopifyCartId: "",
    checkoutUrl: "",
    items: [],
    totalAmount: 0,
    subtotalAmount: 0,
    currencyCode: "",
    totalQuantity: 0,
  };
}

async function syncCart(userId, shopifyCart) {
  const normalized = normalizeCart(shopifyCart, userId);
  const cart = await CartModel.findOneAndUpdate(
    { user: userId },
    { $set: normalized },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return cart.toObject();
}

async function loadCurrentCart(userId, buyerIp) {
  const storedCart = await CartModel.findOne({ user: userId });
  if (!storedCart?.shopifyCartId) return null;

  const shopifyCart = await getStorefrontCart(storedCart.shopifyCartId, buyerIp);
  if (!shopifyCart) {
    await CartModel.findOneAndDelete({ user: userId });
    return null;
  }

  return shopifyCart;
}

function getBuyerIp(req) {
  return req.ip || req.socket?.remoteAddress;
}

export const addToCart = catchAsync(async (req, res) => {
  const { variantId, quantity = 1 } = req.body;
  const userId = req.user._id;
  const parsedQuantity = Number(quantity);

  if (!variantId) {
    throw new AppError(httpStatus.BAD_REQUEST, "Shopify variant ID is required");
  }
  if (!Number.isInteger(parsedQuantity) || parsedQuantity < 1) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Quantity must be a positive integer"
    );
  }

  const buyerIp = getBuyerIp(req);
  let shopifyCart = await loadCurrentCart(userId, buyerIp);
  if (shopifyCart) {
    shopifyCart = await addStorefrontCartLines({
      cartId: shopifyCart.id,
      lines: [
        { merchandiseId: variantGid(variantId), quantity: parsedQuantity },
      ],
      buyerIp,
    });
  } else {
    shopifyCart = await createStorefrontCart({
      merchandiseId: variantGid(variantId),
      quantity: parsedQuantity,
      email: req.user.email,
      buyerIp,
    });
  }

  const cart = await syncCart(userId, shopifyCart);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Added to Shopify cart",
    data: cart,
  });
});

export const getCart = catchAsync(async (req, res) => {
  const shopifyCart = await loadCurrentCart(req.user._id, getBuyerIp(req));
  const cart = shopifyCart
    ? await syncCart(req.user._id, shopifyCart)
    : emptyCart(req.user._id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Shopify cart fetched",
    data: cart,
  });
});

export const updateCart = catchAsync(async (req, res) => {
  const { lineId, product, shopifyProductId, variantId, quantity } = req.body;
  const parsedQuantity = Number(quantity);
  if (!Number.isInteger(parsedQuantity) || parsedQuantity < 0) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Quantity must be a non-negative integer"
    );
  }

  const buyerIp = getBuyerIp(req);
  const shopifyCart = await loadCurrentCart(req.user._id, buyerIp);
  if (!shopifyCart) {
    throw new AppError(httpStatus.NOT_FOUND, "Cart not found");
  }

  const normalized = normalizeCart(shopifyCart, req.user._id);
  const legacyProductId = shopifyProductId || product;
  const item = normalized.items.find(
    (candidate) =>
      candidate.lineId === lineId ||
      (variantId && candidate.variantId === String(variantId)) ||
      (legacyProductId &&
        candidate.shopifyProductId === String(legacyProductId))
  );
  if (!item) {
    throw new AppError(httpStatus.NOT_FOUND, "Cart line not found");
  }

  const updatedShopifyCart =
    parsedQuantity === 0
      ? await removeStorefrontCartLines({
          cartId: shopifyCart.id,
          lineIds: [item.lineId],
          buyerIp,
        })
      : await updateStorefrontCartLines({
          cartId: shopifyCart.id,
          lines: [{ id: item.lineId, quantity: parsedQuantity }],
          buyerIp,
        });

  const cart = await syncCart(req.user._id, updatedShopifyCart);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Shopify cart updated",
    data: cart,
  });
});

export const clearCart = catchAsync(async (req, res) => {
  const buyerIp = getBuyerIp(req);
  const shopifyCart = await loadCurrentCart(req.user._id, buyerIp);
  if (!shopifyCart) {
    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Shopify cart cleared",
      data: emptyCart(req.user._id),
    });
  }

  const lineIds = (shopifyCart.lines?.nodes || []).map((line) => line.id);
  const clearedCart = lineIds.length
    ? await removeStorefrontCartLines({
        cartId: shopifyCart.id,
        lineIds,
        buyerIp,
      })
    : shopifyCart;
  const cart = await syncCart(req.user._id, clearedCart);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Shopify cart cleared",
    data: cart,
  });
});

export const getCheckout = catchAsync(async (req, res) => {
  const buyerIp = getBuyerIp(req);
  let shopifyCart = await loadCurrentCart(req.user._id, buyerIp);
  if (!shopifyCart || !shopifyCart.totalQuantity) {
    throw new AppError(httpStatus.BAD_REQUEST, "Cart is empty");
  }

  shopifyCart = await updateStorefrontBuyerIdentity({
    cartId: shopifyCart.id,
    email: req.user.email,
    buyerIp,
  });
  const cart = await syncCart(req.user._id, shopifyCart);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Shopify checkout created",
    data: {
      checkoutUrl: cart.checkoutUrl,
      shopifyCartId: cart.shopifyCartId,
    },
  });
});
