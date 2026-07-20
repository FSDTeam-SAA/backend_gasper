import mongoose, { Schema } from 'mongoose';

const cartItemSchema = new Schema({
  lineId: {
    type: String,
    default: '',
  },
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
  variantTitle: { type: String, default: '' },
  image: { type: String, default: '' },
  total: { type: Number, default: 0 },
  currencyCode: { type: String, default: '' },
  quantityAvailable: { type: Number, default: -1 },
  availableForSale: { type: Boolean, default: true },
});

const cartWarningSchema = new Schema(
  {
    code: { type: String, default: '' },
    message: { type: String, default: '' },
  },
  { _id: false }
);

const cartSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    items: [cartItemSchema],
    shopifyCartId: {
      type: String,
      default: '',
    },
    checkoutUrl: {
      type: String,
      default: '',
    },
    totalAmount: {
      type: Number,
      default: 0,
    },
    subtotalAmount: {
      type: Number,
      default: 0,
    },
    currencyCode: {
      type: String,
      default: '',
    },
    totalQuantity: {
      type: Number,
      default: 0,
    },
    warnings: {
      type: [cartWarningSchema],
      default: [],
    },
  },
  { timestamps: true }
);

export const Cart = mongoose.model('Cart', cartSchema);
