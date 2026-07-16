import httpStatus from "http-status";
import AppError from "../errors/AppError.js";

const CART_FRAGMENT = `
  fragment CartFields on Cart {
    id
    checkoutUrl
    totalQuantity
    cost {
      subtotalAmount { amount currencyCode }
      totalAmount { amount currencyCode }
    }
    lines(first: 100) {
      nodes {
        id
        quantity
        cost {
          amountPerQuantity { amount currencyCode }
          totalAmount { amount currencyCode }
        }
        merchandise {
          ... on ProductVariant {
            id
            title
            availableForSale
            image { url altText }
            product {
              id
              title
              handle
              featuredImage { url altText }
            }
          }
        }
      }
    }
  }
`;

function getStorefrontConfig() {
  const domain =
    process.env.SHOPIFY_STOREFRONT_API_DOMAIN || process.env.SHOPIFY_SHOP_URL;
  const apiVersion = process.env.SHOPIFY_API_VERSION || "2026-04";

  if (!domain) {
    throw new AppError(
      httpStatus.SERVICE_UNAVAILABLE,
      "SHOPIFY_SHOP_URL is required for Shopify cart operations"
    );
  }

  return {
    endpoint: `https://${domain}/api/${apiVersion}/graphql.json`,
    accessToken: process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN,
  };
}

function formatGraphqlErrors(errors = []) {
  return errors.map((error) => error.message).filter(Boolean).join("; ");
}

async function storefrontRequest(query, variables, buyerIp) {
  const config = getStorefrontConfig();
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (config.accessToken) {
    headers["X-Shopify-Storefront-Access-Token"] = config.accessToken;
  }
  if (buyerIp) {
    headers["Shopify-Storefront-Buyer-IP"] = buyerIp;
  }

  const response = await fetch(config.endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });

  const bodyText = await response.text();
  let body;
  try {
    body = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    body = {};
  }

  if (!response.ok) {
    throw new AppError(
      httpStatus.BAD_GATEWAY,
      `Shopify Storefront API request failed (${response.status})`
    );
  }

  if (body.errors?.length) {
    throw new AppError(
      httpStatus.BAD_GATEWAY,
      `Shopify Storefront API error: ${formatGraphqlErrors(body.errors)}`
    );
  }

  return body.data;
}

function getMutationCart(data, operationName) {
  const payload = data?.[operationName];
  if (!payload) {
    throw new AppError(
      httpStatus.BAD_GATEWAY,
      `Shopify did not return a ${operationName} result`
    );
  }

  if (payload.userErrors?.length) {
    const message = payload.userErrors
      .map((error) => error.message)
      .filter(Boolean)
      .join("; ");
    throw new AppError(
      httpStatus.BAD_REQUEST,
      message || "Shopify rejected the cart operation"
    );
  }

  if (!payload.cart) {
    throw new AppError(httpStatus.BAD_GATEWAY, "Shopify cart was not returned");
  }

  return payload.cart;
}

export async function createStorefrontCart({
  merchandiseId,
  quantity = 1,
  email,
  buyerIp,
} = {}) {
  const lines = merchandiseId ? [{ merchandiseId, quantity }] : [];
  const buyerIdentity = email ? { email } : undefined;
  const data = await storefrontRequest(
    `${CART_FRAGMENT}
      mutation CartCreate($input: CartInput!) {
        cartCreate(input: $input) {
          cart { ...CartFields }
          userErrors { field message code }
          warnings { code message }
        }
      }
    `,
    { input: { lines, buyerIdentity } },
    buyerIp
  );

  return getMutationCart(data, "cartCreate");
}

export async function getStorefrontCart(cartId, buyerIp) {
  const data = await storefrontRequest(
    `${CART_FRAGMENT}
      query Cart($id: ID!) {
        cart(id: $id) { ...CartFields }
      }
    `,
    { id: cartId },
    buyerIp
  );

  return data?.cart || null;
}

export async function addStorefrontCartLines({
  cartId,
  lines,
  buyerIp,
}) {
  const data = await storefrontRequest(
    `${CART_FRAGMENT}
      mutation CartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
        cartLinesAdd(cartId: $cartId, lines: $lines) {
          cart { ...CartFields }
          userErrors { field message code }
          warnings { code message }
        }
      }
    `,
    { cartId, lines },
    buyerIp
  );

  return getMutationCart(data, "cartLinesAdd");
}

export async function updateStorefrontCartLines({
  cartId,
  lines,
  buyerIp,
}) {
  const data = await storefrontRequest(
    `${CART_FRAGMENT}
      mutation CartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
        cartLinesUpdate(cartId: $cartId, lines: $lines) {
          cart { ...CartFields }
          userErrors { field message code }
          warnings { code message }
        }
      }
    `,
    { cartId, lines },
    buyerIp
  );

  return getMutationCart(data, "cartLinesUpdate");
}

export async function removeStorefrontCartLines({
  cartId,
  lineIds,
  buyerIp,
}) {
  const data = await storefrontRequest(
    `${CART_FRAGMENT}
      mutation CartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
        cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
          cart { ...CartFields }
          userErrors { field message code }
          warnings { code message }
        }
      }
    `,
    { cartId, lineIds },
    buyerIp
  );

  return getMutationCart(data, "cartLinesRemove");
}

export async function updateStorefrontBuyerIdentity({
  cartId,
  email,
  buyerIp,
}) {
  const data = await storefrontRequest(
    `${CART_FRAGMENT}
      mutation CartBuyerIdentityUpdate(
        $cartId: ID!
        $buyerIdentity: CartBuyerIdentityInput!
      ) {
        cartBuyerIdentityUpdate(
          cartId: $cartId
          buyerIdentity: $buyerIdentity
        ) {
          cart { ...CartFields }
          userErrors { field message code }
          warnings { code message }
        }
      }
    `,
    { cartId, buyerIdentity: email ? { email } : {} },
    buyerIp
  );

  return getMutationCart(data, "cartBuyerIdentityUpdate");
}
