import crypto from "crypto";
import AppError from "../errors/AppError.js";
import { ShopifyOAuthState } from "../model/shopify.oauth.state.model.js";

const DEFAULT_SCOPE = "openid email customer-account-api:full";
const STATE_TTL_MS = 10 * 60 * 1000;

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

async function postToken(body, config) {
  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };

  const response = await fetch(config.tokenEndpoint, {
    method: "POST",
    headers,
    body: new URLSearchParams(body),
  });
  const bodyText = await response.text();
  const data = parseJson(bodyText);

  if (!response.ok) {
    const detail = data.error_description || data.error || "Token exchange failed";
    throw new AppError(502, `Shopify token exchange failed: ${detail}`);
  }

  if (!data.access_token) {
    throw new AppError(502, "Shopify token response did not contain an access token");
  }

  return data;
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

  return postToken(
    {
      grant_type: "authorization_code",
      client_id: config.clientId,
      code,
      redirect_uri: config.redirectUri,
      code_verifier: statePayload.codeVerifier,
    },
    config
  );
}

export async function fetchShopifyCustomer(accessToken) {
  const config = requireConfig();
  const discoveryUrl = `https://${config.storefrontDomain}/.well-known/customer-account-api`;
  const discoveryResponse = await fetch(discoveryUrl);

  if (!discoveryResponse.ok) {
    throw new AppError(502, "Unable to discover Shopify Customer Account API");
  }

  const discovery = await discoveryResponse.json();
  if (!discovery.graphql_api) {
    throw new AppError(502, "Shopify Customer Account API has no GraphQL endpoint");
  }

  const response = await fetch(discovery.graphql_api, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: accessToken,
    },
    body: JSON.stringify({
      query: `
        query CurrentCustomer {
          customer {
            id
            displayName
            firstName
            lastName
            emailAddress { emailAddress }
            phoneNumber { phoneNumber }
          }
        }
      `,
    }),
  });

  const body = await response.json();
  if (!response.ok || body.errors?.length || !body.data?.customer) {
    throw new AppError(401, "Unable to retrieve the authenticated Shopify customer");
  }

  const customer = body.data.customer;
  return {
    id: customer.id,
    displayName: customer.displayName || "",
    firstName: customer.firstName || "",
    lastName: customer.lastName || "",
    email: customer.emailAddress?.emailAddress || customer.email || "",
    phone: customer.phoneNumber?.phoneNumber || customer.phone || "",
  };
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
