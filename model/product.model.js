import mongoose from "mongoose";

const optionSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  price: {
    type: Number,
    required: true,
    min: [0, "Price cannot be negative"],
  },
  quantityType: {
    type: String,
    enum: ["pieces", "kg"],
    required: true,
  },
  stock: {
    type: Number,
    min: [0, "Stock cannot be negative"],
    default: 0,
  },
});

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
    },
    description: {
      type: String,
      required: [true, "Product description is required"],
      trim: true,
    },
    basePrice: {
      type: Number,
      required: [true, "Product price is required"],
      min: [0, "Price cannot be negative"],
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductCategory",
      required: [true, "Category is required"],
    },
    options: [optionSchema],
    discountPercent: {
      type: Number,
      min: [0, "Discount cannot be negative"],
      max: [100, "Discount cannot exceed 100"],
      default: 0,
    },
    stock: {
      type: Number,
      min: [0, "Stock cannot be negative"],
      default: 0,
    },
    images: {
      type: [String],
      default: [],
      required: [true, "At least one image is required"],
    },
    variation: {
      type: String,
      trim: true,
    },
    review: [
      {
        rating: {
          type: Number,
          min: [1, "Rating must be at least 1"],
          max: [5, "Rating cannot exceed 5"],
          required: true,
        },
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        text: {
          type: String,
          trim: true,
        },
      },
    ],
    reviewsCount: {
      type: Number,
      default: 0,
      min: [0, "Reviews count cannot be negative"],
    },
  },
  {
    timestamps: true,
  }
);

productSchema.virtual("averageRating").get(function () {
  const sum = this.review?.reduce((acc, r) => acc + r.rating, 0);
  return this.reviewsCount > 0
    ? Math.round((sum / this.reviewsCount) * 10) / 10
    : 0;
});

productSchema.set("toJSON", { virtuals: true });

export const Product = mongoose.model("Product", productSchema);
