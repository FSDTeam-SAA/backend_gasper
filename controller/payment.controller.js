import { Order } from "../model/order.model.js";
import { paymentInfo } from "../model/payment.model.js";
import Stripe from "stripe";
import httpStatus from "http-status";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2022-11-15",
});

export const createPayment = async (req, res) => {
  const userId = req.user._id;
  const { orderId } = req.body;

  if (!orderId) {
    return res.status(httpStatus.BAD_REQUEST).json({
      success: false,
      message: "Order ID is required",
    });
  }

  const order = await Order.findById(orderId);

  if (!order) {
    return res.status(httpStatus.NOT_FOUND).json({
      success: false,
      message: "Order not found",
    });
  }

  if (order.paymentStatus === "paid") {
    return res.status(httpStatus.BAD_REQUEST).json({
      success: false,
      message: "Order already paid",
    });
  }

  const amount = Math.round(order.totalAmount * 100);

  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency: "usd",
    automatic_payment_methods: { enabled: true },
    metadata: {
      userId: userId.toString(),
      orderId: order._id.toString(),
    },
  });

  await paymentInfo.create({
    userId,
    orderId: order._id,
    price: order.totalAmount,
    transactionId: paymentIntent.id,
    paymentStatus: "pending",
  });

  return res.status(httpStatus.OK).json({
    success: true,
    message: "PaymentIntent created",
    data: {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    },
  });
};

export const confirmPayment = async (req, res) => {
  const { paymentIntentId } = req.body;

  if (!paymentIntentId) {
    return res.status(400).json({
      success: false,
      message: "PaymentIntent ID is required",
    });
  }

  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

  if (!paymentIntent) {
    return res.status(404).json({
      success: false,
      message: "PaymentIntent not found",
    });
  }

  const paymentRecord = await paymentInfo.findOne({
    transactionId: paymentIntentId,
  });

  if (!paymentRecord) {
    return res.status(404).json({
      success: false,
      message: "Payment record not found",
    });
  }

  if (paymentIntent.status === "succeeded") {
    await paymentInfo.findByIdAndUpdate(paymentRecord._id, {
      paymentStatus: "complete",
    });

    await Order.findByIdAndUpdate(paymentRecord.orderId, {
      paymentStatus: "paid",
    });

    return res.status(200).json({
      success: true,
      message: "Payment successful",
    });
  }

  if (
    paymentIntent.status === "processing" ||
    paymentIntent.status === "requires_action"
  ) {
    return res.status(200).json({
      success: true,
      message: "Payment processing",
      data: { status: paymentIntent.status },
    });
  }

  await paymentInfo.findByIdAndUpdate(paymentRecord._id, {
    paymentStatus: "failed",
  });

  return res.status(400).json({
    success: false,
    message: "Payment failed",
    data: { status: paymentIntent.status },
  });
};
