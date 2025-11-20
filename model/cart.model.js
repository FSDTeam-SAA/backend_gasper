import mongoose from "mongoose";

const cartItemSchema = new mongoose.Schema({
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
    default: 1,
  },
  price: {
    type: Number,
    required: true,
  },
  specialRequest: {
    type: String,
    trim: true,
  },
});

const cartSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    items: [cartItemSchema],
    subtotal: {
      type: Number,
      default: 0,
    },
    deliveryFee: {
      type: Number,
      default: 0,
    },
    total: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  { timestamps: true }
);

cartSchema.pre("save", function (next) {
  this.subtotal = this.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
  this.total = this.subtotal + this.deliveryFee;
  next();
});

export const Cart = mongoose.model("Cart", cartSchema);
