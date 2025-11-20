import mongoose from "mongoose";
import crypto from "crypto";

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  variant: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  quantity: {
    type: Number,
    required: true,
    min: [1, "Quantity must be at least 1"],
  },
  price: {
    type: Number,
    required: true,
  },
  specialRequest: {
    type: String,
    trim: true,
  },
  totalPrice: {
    type: Number,
    required: true,
  },
});

const orderSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      unique: true,
      default: () => crypto.randomInt(100000, 999999).toString(),
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    address: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User.addresses",
      required: true,
    },
    deliveryInstructions: {
      type: String,
      trim: true,
    },
    deliveryTime: {
      type: Date,
      required: true,
    },
    products: [orderItemSchema],
    subtotal: {
      type: Number,
      required: true,
    },
    deliveryFee: {
      type: Number,
      required: true,
      default: 0,
    },
    totalPrice: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["placed", "packaging", "on_way", "delivered", "cancelled"],
      default: "placed",
    },
    paymentStatus: {
      type: String,
      enum: ["paid", "unpaid", "refunded"],
      default: "unpaid",
    },
    paymentMethod: {
      type: String,
      enum: ["cash_on_delivery", "card", "apple_pay", "visa"],
      required: true,
    },
    transactionId: {
      type: String,
    },
    tracking: {
      type: String,
    },
    date: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

orderSchema.index({ status: 1, date: -1, code: 1 });

export const Order = mongoose.model("Order", orderSchema);
