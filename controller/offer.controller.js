import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import httpStatus from "http-status";
import { Offer } from "../model/offer.model.js";
import { uploadOnCloudinary } from "../utils/commonMethod.js";

export const createOffer = catchAsync(async (req, res) => {
  let userId = req.user._id;
  if (!userId)
    throw new AppError(httpStatus.FORBIDDEN, "You need to pass the token");

  const {
    title,
    discount = 0,
    isBannerOnly = false,
    startDate,
    endDate,
  } = req.body;

  if (!title || !startDate || !endDate)
    throw new AppError(httpStatus.BAD_REQUEST, "Title and dates required");

  if (new Date(startDate) >= new Date(endDate))
    throw new AppError(httpStatus.BAD_REQUEST, "Start before end");

  if (req.file) {
    const upload = await uploadOnCloudinary(req.file.buffer);

    const offer = await Offer.create({
      title,
      image: { public_id: upload.public_id, url: upload.secure_url },
      discount: Number(discount),
      isBannerOnly,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    });

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: "Offer created",
      data: offer,
    });
  } else {
    throw new AppError(httpStatus.BAD_REQUEST, "Image required");
  }
});

export const getAllOffers = catchAsync(async (req, res) => {
  let userId = req.user._id;
  if (!userId)
    throw new AppError(httpStatus.FORBIDDEN, "You need to pass the token");

  const { page = 1, limit = 10, active } = req.query;

  const filter = active ? { isActive: active === "true" } : {};

  const offers = await Offer.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  const total = await Offer.countDocuments(filter);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Offers fetched",
    data: {
      offers,
      pagination: { page: Number(page), limit: Number(limit), total },
    },
  });
});

export const updateOffer = catchAsync(async (req, res) => {
  let userId = req.user._id;
  if (!userId)
    throw new AppError(httpStatus.FORBIDDEN, "You need to pass the token");

  const { id } = req.params;

  const { title, discount, isBannerOnly, startDate, endDate, isActive } =
    req.body;

  const offer = await Offer.findById(id);

  if (!offer) throw new AppError(httpStatus.NOT_FOUND, "Not found");

  if (title) offer.title = title;
  if (discount !== undefined) offer.discount = Number(discount);
  if (isBannerOnly !== undefined) offer.isBannerOnly = isBannerOnly;
  if (startDate) offer.startDate = new Date(startDate);
  if (endDate) offer.endDate = new Date(endDate);
  if (isActive !== undefined) offer.isActive = isActive;

  if (req.file) {
    const upload = await uploadOnCloudinary(req.file.buffer);
    offer.image = { public_id: upload.public_id, url: upload.secure_url };
  }

  await offer.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Updated",
    data: offer,
  });
});

export const deleteOffer = catchAsync(async (req, res) => {
  let userId = req.user._id;
  if (!userId)
    throw new AppError(httpStatus.FORBIDDEN, "You need to pass the token");

  const { id } = req.params;

  await Offer.findByIdAndDelete(id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Deleted",
  });
});
