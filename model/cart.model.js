import mongoose, { Schema } from 'mongoose';

const cartItemSchema = new Schema({
  shopifyProductId: {
    type: String,
    required: true,
  },
  variantId: {
    type: String,
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: [1, 'Quantity must be at least 1'],
  },
  price: {
    type: Number,
    required: true,
  },
  title: { type: String, default: '' },
  image: { type: String, default: '' },
});

const cartSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    items: [cartItemSchema],
    totalAmount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

export const Cart = mongoose.model('Cart', cartSchema);
