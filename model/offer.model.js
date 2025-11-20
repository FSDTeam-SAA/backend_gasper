import mongoose from "mongoose";

const offerSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    image: {
      public_id: { type: String, required: true },
      url: { type: String, required: true },
    },
    discount: {
      type: Number,
      min: [0, "Discount cannot be negative"],
      max: [100, "Discount cannot exceed 100"],
      default: 0,
    },
    isBannerOnly: {
      type: Boolean,
      default: false,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

offerSchema.virtual("active").get(function () {
  const now = new Date();
  return this.startDate <= now && now <= this.endDate && this.isActive;
});

offerSchema.set("toJSON", { virtuals: true });

export const Offer = mongoose.model("Offer", offerSchema);
