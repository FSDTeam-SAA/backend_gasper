import mongoose from "mongoose";

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    image: {
      type: String,
      default: null,
    },
    description: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

export const ProductCategory = mongoose.model(
  "ProductCategory",
  categorySchema
);
