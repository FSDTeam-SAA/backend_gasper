import mongoose, { Schema } from "mongoose";

const shopifyOAuthStateSchema = new Schema(
  {
    state: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    codeVerifier: {
      type: String,
      required: true,
    },
    nonce: {
      type: String,
      required: true,
    },
    redirectUri: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },
  },
  { timestamps: true }
);

export const ShopifyOAuthState = mongoose.model(
  "ShopifyOAuthState",
  shopifyOAuthStateSchema
);
