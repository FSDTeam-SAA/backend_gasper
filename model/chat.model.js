import mongoose, { Schema } from "mongoose";

const chatSchema = new Schema(
  {
    name: { type: String, required: true },
    seller: { type: Schema.Types.ObjectId, ref: "User" },
    user: { type: Schema.Types.ObjectId, ref: "User" },
    messages: [
      {
        text: { type: String },
        user: { type: Schema.Types.ObjectId, ref: "User" },
        date: { type: Date, default: Date.now },
        read: { type: Boolean, default: false },
        askPrice: { type: Number },
        accept: { type: Boolean, default: false },
        productId: {
          type: Schema.Types.ObjectId,
          ref: "Product",
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

export const Chat = mongoose.model("chat", chatSchema);
