import httpStatus from "http-status";
import { Cart as CartModel } from "../model/cart.model.js";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import { fetchProductById } from "../utils/shopify.service.js";
import {
  addStorefrontCartLines,
  createStorefrontCart,
  getStorefrontCart,
  removeStorefrontCartLines,
  updateStorefrontCartLines,
} from "../utils/shopify.storefront.service.js";

const inventoryCache = new Map();
const INVENTORY_CACHE_MS = 60 * 1000;

async function getVariantInventory(productId) {
  const cached = inventoryCache.get(productId);
  if (cached && cached.expiresAt > Date.now()) return cached.variants;

  const product = await fetchProductById(productId);
  const variants = new Map(
    (product.variants || []).map((variant) => [
      String(variant.id),
      Number(variant.stock),
    ])
  );
  inventoryCache.set(productId, {
    expiresAt: Date.now() + INVENTORY_CACHE_MS,
    variants,
  });
  return variants;
}

async function assertVariantQuantity({ productId, variantId, quantity }) {
  if (!productId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Shopify product ID is required"
    );
  }

  const variants = await getVariantInventory(numericShopifyId(productId));
  const normalizedVariantId = numericShopifyId(variantId);
  if (!variants.has(normalizedVariantId)) {
    throw new AppError(httpStatus.NOT_FOUND, "Product variant not found");
  }

  const available = variants.get(normalizedVariantId);
  if (!Number.isInteger(available) || available <= 0) {
    throw new AppError(
      httpStatus.CONFLICT,
      "This product variant is out of stock"
    );
  }
  if (quantity > available) {
    throw new AppError(
      httpStatus.CONFLICT,
      `Only ${available} item${available === 1 ? " is" : "s are"} available for this variant`
    );
  }

  return available;
}

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
    warnings: (shopifyCart.storefrontWarnings || []).map((warning) => ({
      code: warning.code || "",
      message: warning.message || "",
    })),
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
    warnings: [],
  };
}

async function enrichCartInventory(normalized) {
  const productIds = [
    ...new Set(normalized.items.map((item) => item.shopifyProductId)),
  ];
  const inventoryByVariant = new Map();

  await Promise.all(
    productIds.map(async (productId) => {
      try {
        const variants = await getVariantInventory(productId);
        for (const [variantId, stock] of variants) {
          inventoryByVariant.set(variantId, stock);
        }
      } catch {
        // Inventory enrichment must not prevent cart operations.
      }
    })
  );

  for (const item of normalized.items) {
    const available = inventoryByVariant.get(item.variantId);
    if (Number.isInteger(available)) item.quantityAvailable = available;
  }

  return normalized;
}

async function syncCart(userId, shopifyCart) {
  const normalized = await enrichCartInventory(
    normalizeCart(shopifyCart, userId)
  );

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

function findCartItem(normalizedCart, identifiers = {}) {
  const lineId = String(identifiers.lineId || "");
  const variantId = numericShopifyId(identifiers.variantId);
  const productId = numericShopifyId(
    identifiers.shopifyProductId || identifiers.product
  );

  if (lineId) {
    const line = normalizedCart.items.find(
      (candidate) => candidate.lineId === lineId
    );
    if (line) return line;
  }
  if (variantId) {
    const variant = normalizedCart.items.find(
      (candidate) => candidate.variantId === variantId
    );
    if (variant) return variant;
  }
  if (productId) {
    return normalizedCart.items.find(
      (candidate) => candidate.shopifyProductId === productId
    );
  }
  return undefined;
}

async function removeResolvedCartItem(req) {
  const buyerIp = getBuyerIp(req);
  const shopifyCart = await loadCurrentCart(req.user._id, buyerIp);
  if (!shopifyCart) {
    throw new AppError(httpStatus.NOT_FOUND, "Cart not found");
  }

  const normalized = normalizeCart(shopifyCart, req.user._id);
  const item = findCartItem(normalized, req.body);
  if (!item) {
    throw new AppError(httpStatus.NOT_FOUND, "Cart line not found");
  }

  const updatedShopifyCart = await removeStorefrontCartLines({
    cartId: shopifyCart.id,
    lineIds: [item.lineId],
    buyerIp,
  });
  return syncCart(req.user._id, updatedShopifyCart);
}

export const addToCart = catchAsync(async (req, res) => {
  const { shopifyProductId, variantId, quantity = 1 } = req.body;
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
  const currentQuantity = shopifyCart
    ? normalizeCart(shopifyCart, userId).items
        .filter((item) => item.variantId === numericShopifyId(variantId))
        .reduce((total, item) => total + item.quantity, 0)
    : 0;
  const expectedQuantity = currentQuantity + parsedQuantity;
  await assertVariantQuantity({
    productId: shopifyProductId,
    variantId,
    quantity: expectedQuantity,
  });

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

  const updatedQuantity = normalizeCart(shopifyCart, userId).items
    .filter((item) => item.variantId === numericShopifyId(variantId))
    .reduce((total, item) => total + item.quantity, 0);
  const cart = await syncCart(userId, shopifyCart);
  if (updatedQuantity !== expectedQuantity) {
    const warning = shopifyCart.storefrontWarnings?.[0]?.message;
    throw new AppError(
      httpStatus.CONFLICT,
      warning || "The requested quantity is no longer in stock"
    );
  }
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
  const item = findCartItem(normalized, {
    lineId,
    product,
    shopifyProductId,
    variantId,
  });
  if (!item) {
    throw new AppError(httpStatus.NOT_FOUND, "Cart line not found");
  }

  if (parsedQuantity > 0) {
    await assertVariantQuantity({
      productId: item.shopifyProductId,
      variantId: item.variantId,
      quantity: parsedQuantity,
    });
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
  if (parsedQuantity > 0) {
    const confirmedItem = normalizeCart(
      updatedShopifyCart,
      req.user._id
    ).items.find((candidate) => candidate.lineId === item.lineId);
    if (!confirmedItem || confirmedItem.quantity !== parsedQuantity) {
      const warning = updatedShopifyCart.storefrontWarnings?.[0]?.message;
      throw new AppError(
        httpStatus.CONFLICT,
        warning || "The requested quantity is no longer in stock"
      );
    }
  }
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Shopify cart updated",
    data: cart,
  });
});

export const removeCartItem = catchAsync(async (req, res) => {
  const cart = await removeResolvedCartItem(req);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Item removed from Shopify cart",
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
  const shopifyCart = await loadCurrentCart(req.user._id, buyerIp);
  if (!shopifyCart || !shopifyCart.totalQuantity) {
    throw new AppError(httpStatus.BAD_REQUEST, "Cart is empty");
  }

  const normalized = await enrichCartInventory(
    normalizeCart(shopifyCart, req.user._id)
  );
  const requestedLineIds = Array.isArray(req.body.selectedLineIds)
    ? [...new Set(req.body.selectedLineIds.map(String))]
    : normalized.items.map((item) => item.lineId);
  const selectedItems = normalized.items.filter((item) =>
    requestedLineIds.includes(item.lineId)
  );

  if (!selectedItems.length) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Select at least one cart item to checkout"
    );
  }
  if (selectedItems.length !== requestedLineIds.length) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "One or more selected cart items are no longer available"
    );
  }

  for (const item of selectedItems) {
    if (!item.availableForSale || item.quantityAvailable === 0) {
      throw new AppError(
        httpStatus.CONFLICT,
        `${item.title || "A selected item"} is out of stock`
      );
    }
    if (
      item.quantityAvailable > -1 &&
      item.quantity > item.quantityAvailable
    ) {
      throw new AppError(
        httpStatus.CONFLICT,
        `Only ${item.quantityAvailable} of ${item.title || "the selected item"} available`
      );
    }
  }

  const checkoutCart = await createStorefrontCart({
    lines: selectedItems.map((item) => ({
      merchandiseId: variantGid(item.variantId),
      quantity: item.quantity,
    })),
    email: req.user.email,
    buyerIp,
  });
  const checkoutItems = normalizeCart(checkoutCart, req.user._id).items;
  const quantityWasAdjusted = selectedItems.some((selectedItem) => {
    const checkoutItem = checkoutItems.find(
      (item) => item.variantId === selectedItem.variantId
    );
    return !checkoutItem || checkoutItem.quantity !== selectedItem.quantity;
  });
  if (quantityWasAdjusted) {
    const warning = checkoutCart.storefrontWarnings?.[0]?.message;
    throw new AppError(
      httpStatus.CONFLICT,
      warning || "One or more selected quantities are no longer in stock"
    );
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Shopify checkout created",
    data: {
      checkoutUrl: checkoutCart.checkoutUrl,
      shopifyCartId: checkoutCart.id,
      selectedLineIds: selectedItems.map((item) => item.lineId),
    },
  });
});

export const completeCheckout = catchAsync(async (req, res) => {
  const selectedLineIds = Array.isArray(req.body.selectedLineIds)
    ? [...new Set(req.body.selectedLineIds.map(String))]
    : [];
  if (!selectedLineIds.length) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Selected cart line IDs are required"
    );
  }

  const buyerIp = getBuyerIp(req);
  const shopifyCart = await loadCurrentCart(req.user._id, buyerIp);
  if (!shopifyCart) {
    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Checked out items cleared",
      data: emptyCart(req.user._id),
    });
  }

  const currentLineIds = new Set(
    (shopifyCart.lines?.nodes || []).map((line) => line.id)
  );
  const removableLineIds = selectedLineIds.filter((lineId) =>
    currentLineIds.has(lineId)
  );
  const updatedCart = removableLineIds.length
    ? await removeStorefrontCartLines({
        cartId: shopifyCart.id,
        lineIds: removableLineIds,
        buyerIp,
      })
    : shopifyCart;
  const cart = await syncCart(req.user._id, updatedCart);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Checked out items cleared",
    data: cart,
  });
});
