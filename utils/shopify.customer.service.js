import crypto from "crypto";
import AppError from "../errors/AppError.js";
import { ShopifyOAuthState } from "../model/shopify.oauth.state.model.js";
import { User } from "../model/user.model.js";

const DEFAULT_SCOPE = "openid email customer-account-api:full";
const STATE_TTL_MS = 10 * 60 * 1000;
const TOKEN_EXPIRY_BUFFER_MS = 60 * 1000;
let customerApiEndpoint;

function getConfig() {
  return {
    clientId: process.env.SHOPIFY_CUSTOMER_CLIENT_ID,
    authorizationEndpoint:
      process.env.SHOPIFY_CUSTOMER_AUTHORIZATION_ENDPOINT,
    tokenEndpoint: process.env.SHOPIFY_CUSTOMER_TOKEN_ENDPOINT,
    logoutEndpoint: process.env.SHOPIFY_CUSTOMER_LOGOUT_ENDPOINT,
    storefrontDomain: process.env.SHOPIFY_CUSTOMER_STOREFRONT_DOMAIN,
    redirectUri: process.env.SHOPIFY_CUSTOMER_REDIRECT_URI,
    scope: process.env.SHOPIFY_CUSTOMER_SCOPE || DEFAULT_SCOPE,
  };
}

function requireConfig() {
  const config = getConfig();
  const required = [
    ["SHOPIFY_CUSTOMER_CLIENT_ID", config.clientId],
    [
      "SHOPIFY_CUSTOMER_AUTHORIZATION_ENDPOINT",
      config.authorizationEndpoint,
    ],
    ["SHOPIFY_CUSTOMER_TOKEN_ENDPOINT", config.tokenEndpoint],
    ["SHOPIFY_CUSTOMER_REDIRECT_URI", config.redirectUri],
    ["SHOPIFY_CUSTOMER_STOREFRONT_DOMAIN", config.storefrontDomain],
  ];

  const missing = required.filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) {
    throw new AppError(
      503,
      `Shopify Customer Account configuration is missing: ${missing.join(", ")}`
    );
  }

  return config;
}

function tokenEncryptionKey() {
  const secret =
    process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY || process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new AppError(
      503,
      "SHOPIFY_TOKEN_ENCRYPTION_KEY or JWT_ACCESS_SECRET is required"
    );
  }
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptCredential(value) {
  if (!value) return undefined;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", tokenEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(String(value), "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

function decryptCredential(value) {
  if (!value) return undefined;
  if (!String(value).startsWith("v1:")) return value;

  try {
    const [, iv, tag, encrypted] = String(value).split(":");
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      tokenEncryptionKey(),
      Buffer.from(iv, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new AppError(401, "Stored Shopify session is invalid. Please sign in again");
  }
}

function generateCodeVerifier() {
  return crypto.randomBytes(32).toString("base64url");
}

function generateCodeChallenge(codeVerifier) {
  return crypto.createHash("sha256").update(codeVerifier).digest("base64url");
}

function generateNonce() {
  return crypto.randomBytes(24).toString("base64url");
}

async function consumeState(state) {
  if (!state) throw new AppError(400, "Shopify OAuth state is required");

  const payload = await ShopifyOAuthState.findOneAndDelete({ state }).lean();
  if (!payload || payload.expiresAt.getTime() < Date.now()) {
    throw new AppError(400, "Shopify OAuth state is invalid or expired");
  }

  return payload;
}

function parseJson(text) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

async function postToken(body, config = requireConfig()) {
  const response = await fetch(config.tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": "Gasper-Mobile-Backend",
    },
    body: new URLSearchParams(body),
  });
  const data = parseJson(await response.text());

  if (!response.ok) {
    const detail = data.error_description || data.error || "Token exchange failed";
    throw new AppError(401, `Shopify session refresh failed: ${detail}`);
  }
  if (!data.access_token) {
    throw new AppError(502, "Shopify token response did not contain an access token");
  }

  return data;
}

async function discoverCustomerApiEndpoint() {
  if (customerApiEndpoint) return customerApiEndpoint;

  const { storefrontDomain } = requireConfig();
  const response = await fetch(
    `https://${storefrontDomain}/.well-known/customer-account-api`,
    { headers: { "User-Agent": "Gasper-Mobile-Backend" } }
  );
  if (!response.ok) {
    throw new AppError(502, "Unable to discover Shopify Customer Account API");
  }

  const discovery = await response.json();
  if (!discovery.graphql_api) {
    throw new AppError(502, "Shopify Customer Account API has no GraphQL endpoint");
  }
  customerApiEndpoint = discovery.graphql_api;
  return customerApiEndpoint;
}

async function requestCustomerApiWithToken(accessToken, query, variables = {}) {
  const endpoint = await discoverCustomerApiEndpoint();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: accessToken,
      "User-Agent": "Gasper-Mobile-Backend",
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = parseJson(await response.text());
  return { response, body };
}

function isAuthenticationError(response, body) {
  if (response.status === 401 || response.status === 403) return true;
  return (body.errors || []).some((error) => {
    const code = String(error.extensions?.code || "").toUpperCase();
    const message = String(error.message || "").toLowerCase();
    return (
      code.includes("AUTH") ||
      message.includes("unauthenticated") ||
      message.includes("access token")
    );
  });
}

function graphQLError(body, fallback) {
  const message = body.errors?.map((error) => error.message).join("; ");
  return new AppError(502, message || fallback);
}

export async function storeShopifyCustomerTokens(userId, tokenData) {
  const update = {
    shopifyCustomerAccessToken: encryptCredential(tokenData.access_token),
    shopifyCustomerAccessTokenExpiresAt: new Date(
      Date.now() + Number(tokenData.expires_in || 3600) * 1000
    ),
  };
  if (tokenData.refresh_token) {
    update.shopifyCustomerRefreshToken = encryptCredential(tokenData.refresh_token);
  }
  if (tokenData.id_token) {
    update.shopifyCustomerIdToken = encryptCredential(tokenData.id_token);
  }
  await User.findByIdAndUpdate(userId, update);
}

async function getShopifyCustomerAccessToken(userId, { forceRefresh = false } = {}) {
  const user = await User.findById(userId).select(
    "+shopifyCustomerAccessToken +shopifyCustomerRefreshToken +shopifyCustomerAccessTokenExpiresAt"
  );
  if (!user || user.authProvider !== "shopify") {
    throw new AppError(401, "A Shopify customer session is required");
  }

  const accessToken = decryptCredential(user.shopifyCustomerAccessToken);
  const expiresAt = user.shopifyCustomerAccessTokenExpiresAt?.getTime() || 0;
  if (!forceRefresh && accessToken && expiresAt > Date.now() + TOKEN_EXPIRY_BUFFER_MS) {
    return accessToken;
  }

  const refreshToken = decryptCredential(user.shopifyCustomerRefreshToken);
  if (!refreshToken) {
    throw new AppError(
      401,
      "Please sign in with Shopify again to enable customer account data"
    );
  }

  const config = requireConfig();
  const tokenData = await postToken({
    grant_type: "refresh_token",
    client_id: config.clientId,
    refresh_token: refreshToken,
  }, config);
  await storeShopifyCustomerTokens(user._id, tokenData);
  return tokenData.access_token;
}

export async function customerAccountRequest(userId, query, variables = {}) {
  let accessToken = await getShopifyCustomerAccessToken(userId);
  let result = await requestCustomerApiWithToken(accessToken, query, variables);

  if (isAuthenticationError(result.response, result.body)) {
    accessToken = await getShopifyCustomerAccessToken(userId, {
      forceRefresh: true,
    });
    result = await requestCustomerApiWithToken(accessToken, query, variables);
  }

  if (!result.response.ok || result.body.errors?.length) {
    throw graphQLError(result.body, "Shopify Customer Account request failed");
  }
  return result.body.data;
}

export async function createAuthorizationRequest() {
  const config = requireConfig();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const nonce = generateNonce();
  const state = crypto.randomBytes(32).toString("base64url");

  await ShopifyOAuthState.create({
    state,
    codeVerifier,
    nonce,
    redirectUri: config.redirectUri,
    expiresAt: new Date(Date.now() + STATE_TTL_MS),
  });

  const url = new URL(config.authorizationEndpoint);
  url.searchParams.set("scope", config.scope);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  return {
    authorizationUrl: url.toString(),
    state,
    redirectUri: config.redirectUri,
  };
}

export async function exchangeAuthorizationCode({ code, state }) {
  const config = requireConfig();
  if (!code) throw new AppError(400, "Shopify authorization code is required");

  const statePayload = await consumeState(state);
  if (statePayload.redirectUri !== config.redirectUri) {
    throw new AppError(400, "Shopify OAuth redirect URI does not match the original request");
  }

  return postToken({
    grant_type: "authorization_code",
    client_id: config.clientId,
    code,
    redirect_uri: config.redirectUri,
    code_verifier: statePayload.codeVerifier,
  }, config);
}

const CUSTOMER_FIELDS = `
  id
  displayName
  firstName
  lastName
  imageUrl
  creationDate
  emailAddress { emailAddress }
  phoneNumber { phoneNumber }
  defaultAddress {
    id
    firstName
    lastName
    address1
    address2
    city
    province
    zoneCode
    country
    territoryCode
    zip
    phoneNumber
    formatted
  }
`;

function normalizeCustomer(customer) {
  const address = customer.defaultAddress;
  return {
    id: customer.id,
    displayName: customer.displayName || "",
    firstName: customer.firstName || "",
    lastName: customer.lastName || "",
    email: customer.emailAddress?.emailAddress || "",
    phone:
      customer.phoneNumber?.phoneNumber || address?.phoneNumber || "",
    imageUrl: customer.imageUrl || "",
    creationDate: customer.creationDate || "",
    defaultAddress: address
      ? {
          id: address.id,
          firstName: address.firstName || "",
          lastName: address.lastName || "",
          address1: address.address1 || "",
          address2: address.address2 || "",
          city: address.city || "",
          province: address.province || "",
          zoneCode: address.zoneCode || "",
          country: address.country || "",
          territoryCode: address.territoryCode || "",
          zip: address.zip || "",
          phoneNumber: address.phoneNumber || "",
          formatted: address.formatted || [],
        }
      : null,
  };
}

export async function fetchShopifyCustomer(accessToken) {
  const { response, body } = await requestCustomerApiWithToken(
    accessToken,
    `query CurrentCustomer { customer { ${CUSTOMER_FIELDS} } }`
  );
  if (!response.ok || body.errors?.length || !body.data?.customer) {
    throw new AppError(401, "Unable to retrieve the authenticated Shopify customer");
  }
  return normalizeCustomer(body.data.customer);
}

export async function fetchCurrentShopifyCustomer(userId) {
  const data = await customerAccountRequest(
    userId,
    `query CurrentCustomer { customer { ${CUSTOMER_FIELDS} } }`
  );
  if (!data.customer) throw new AppError(404, "Shopify customer was not found");
  return normalizeCustomer(data.customer);
}

function throwUserErrors(errors, fallback) {
  if (!errors?.length) return;
  throw new AppError(
    422,
    errors.map((error) => error.message).filter(Boolean).join("; ") || fallback
  );
}

function cleanAddressInput(address) {
  const allowed = [
    "firstName",
    "lastName",
    "address1",
    "address2",
    "city",
    "company",
    "territoryCode",
    "phoneNumber",
    "zoneCode",
    "zip",
  ];
  return Object.fromEntries(
    allowed
      .filter((key) => address[key] !== undefined && address[key] !== null)
      .map((key) => [key, String(address[key]).trim()])
  );
}

export async function updateCurrentShopifyCustomer(userId, input) {
  const customerInput = {};
  if (input.firstName !== undefined) customerInput.firstName = input.firstName;
  if (input.lastName !== undefined) customerInput.lastName = input.lastName;

  if (Object.keys(customerInput).length) {
    const data = await customerAccountRequest(
      userId,
      `mutation UpdateCustomer($input: CustomerUpdateInput!) {
        customerUpdate(input: $input) {
          customer { id firstName lastName displayName }
          userErrors { field message }
        }
      }`,
      { input: customerInput }
    );
    throwUserErrors(data.customerUpdate?.userErrors, "Unable to update customer");
  }

  if (input.address && input.address.address1) {
    const address = cleanAddressInput(input.address);
    if (!address.territoryCode) {
      throw new AppError(422, "A two-letter country code is required for the address");
    }

    if (input.address.id) {
      const data = await customerAccountRequest(
        userId,
        `mutation UpdateAddress($addressId: ID!, $address: CustomerAddressInput!, $defaultAddress: Boolean) {
          customerAddressUpdate(addressId: $addressId, address: $address, defaultAddress: $defaultAddress) {
            customerAddress { id }
            userErrors { field message }
          }
        }`,
        { addressId: input.address.id, address, defaultAddress: true }
      );
      throwUserErrors(
        data.customerAddressUpdate?.userErrors,
        "Unable to update customer address"
      );
    } else {
      const data = await customerAccountRequest(
        userId,
        `mutation CreateAddress($address: CustomerAddressInput!, $defaultAddress: Boolean) {
          customerAddressCreate(address: $address, defaultAddress: $defaultAddress) {
            customerAddress { id }
            userErrors { field message }
          }
        }`,
        { address, defaultAddress: true }
      );
      throwUserErrors(
        data.customerAddressCreate?.userErrors,
        "Unable to create customer address"
      );
    }
  }

  return fetchCurrentShopifyCustomer(userId);
}

function money(value) {
  return {
    amount: Number(value?.amount || 0),
    currencyCode: value?.currencyCode || "",
  };
}

function normalizeOrderStatus(order) {
  if (order.cancelledAt) return "cancelled";
  const fulfillment = String(order.fulfillmentStatus || "").toLowerCase();
  if (fulfillment === "fulfilled") return "completed";
  if (fulfillment === "in_progress" || fulfillment === "partially_fulfilled") {
    return "in_progress";
  }
  return String(order.financialStatus || "pending").toLowerCase();
}

function normalizeCustomerOrder(order) {
  return {
    id: order.id,
    orderId: order.name || String(order.number || ""),
    orderNumber: order.number,
    status: normalizeOrderStatus(order),
    financialStatus: order.financialStatus || "",
    fulfillmentStatus: order.fulfillmentStatus || "",
    total: money(order.totalPrice),
    subtotal: money(order.subtotal),
    shipping: money(order.totalShipping),
    statusPageUrl: order.statusPageUrl || "",
    createdAt: order.createdAt,
    processedAt: order.processedAt,
    updatedAt: order.updatedAt,
    cancelledAt: order.cancelledAt,
    items: (order.lineItems?.nodes || []).map((item) => ({
      id: item.id,
      productId: item.productId || "",
      variantId: item.variantId || "",
      title: item.name || item.title || "Product",
      variantTitle: item.variantTitle || item.presentmentTitle || "",
      quantity: item.quantity,
      image: item.image
        ? { url: item.image.url || "", altText: item.image.altText || "" }
        : null,
      unitPrice: money(item.price),
      totalPrice: money(item.totalPrice),
    })),
  };
}

const ORDER_FIELDS = `
  id
  name
  number
  createdAt
  processedAt
  updatedAt
  cancelledAt
  financialStatus
  fulfillmentStatus
  statusPageUrl
  subtotal { amount currencyCode }
  totalPrice { amount currencyCode }
  totalShipping { amount currencyCode }
  lineItems(first: 50) {
    nodes {
      id
      productId
      variantId
      name
      title
      presentmentTitle
      variantTitle
      quantity
      image { url altText }
      price { amount currencyCode }
      totalPrice { amount currencyCode }
    }
  }
`;

export async function fetchShopifyCustomerOrders(userId, { first = 20, after } = {}) {
  const data = await customerAccountRequest(
    userId,
    `query CustomerOrders($first: Int!, $after: String) {
      customer {
        orders(first: $first, after: $after, reverse: true) {
          nodes { ${ORDER_FIELDS} }
          pageInfo { hasNextPage endCursor }
        }
      }
    }`,
    { first: Math.min(Math.max(Number(first) || 20, 1), 50), after: after || null }
  );
  const connection = data.customer?.orders;
  if (!connection) throw new AppError(404, "Shopify order history was not found");
  return {
    orders: connection.nodes.map(normalizeCustomerOrder),
    pageInfo: connection.pageInfo,
  };
}

export async function fetchShopifyCustomerOrder(userId, orderId) {
  const data = await customerAccountRequest(
    userId,
    `query CustomerOrder($id: ID!) { order(id: $id) { ${ORDER_FIELDS} } }`,
    { id: orderId }
  );
  if (!data.order) throw new AppError(404, "Shopify order was not found");
  return normalizeCustomerOrder(data.order);
}

export function createLogoutUrl({ idTokenHint, postLogoutRedirectUri } = {}) {
  const config = requireConfig();
  if (!config.logoutEndpoint) {
    throw new AppError(503, "SHOPIFY_CUSTOMER_LOGOUT_ENDPOINT is not configured");
  }
  if (!idTokenHint) {
    throw new AppError(400, "Shopify id_token_hint is required for logout");
  }

  const url = new URL(config.logoutEndpoint);
  url.searchParams.set("id_token_hint", idTokenHint);
  if (postLogoutRedirectUri) {
    url.searchParams.set("post_logout_redirect_uri", postLogoutRedirectUri);
  }
  return url.toString();
}
