import { Report } from "../model/report.model.js";
import catchAsync from "../utils/catchAsync.js";
import AppError from "../errors/AppError.js";
import httpStatus from "http-status";
import sendResponse from "../utils/sendResponse.js";
import { uploadOnCloudinary } from "../utils/commonMethod.js";

export const createReport = catchAsync(async (req, res) => {
  const { orderId, reason, description, amount } = req.body;

  if (!orderId || !reason)
    throw new AppError(httpStatus.BAD_REQUEST, "Order and reason required");

  const report = await Report.create({
    user: req.user._id,
    order: orderId,
    reason,
    description,
    amount: Number(amount),
  });

  if (req.file) {
    const upload = await uploadOnCloudinary(req.file.buffer);
    report.attachment = { public_id: upload.public_id, url: upload.secure_url };

    await report.save();
  }

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Report submitted",
    data: report,
  });
});

export const getAllReports = catchAsync(async (req, res) => {
  let userId = req.user._id;
  if (!userId)
    throw new AppError(httpStatus.FORBIDDEN, "You  need to pass the token");

  const { status, page = 1, limit = 10 } = req.query;
  const filter = { status };

  const reports = await Report.find(filter)
    .populate("user", "firstName lastName email phone")
    .populate("order", "code totalPrice")
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  const total = await Report.countDocuments(filter);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Reports fetched",
    data: {
      reports,
      pagination: { page: Number(page), limit: Number(limit), total },
    },
  });
});

export const getReportById = catchAsync(async (req, res) => {
  const report = await Report.findById(req.params.id)
    .populate("user", "firstName lastName")
    .populate("order", "code totalPrice status");

  if (!report) throw new AppError(httpStatus.NOT_FOUND, "Report not found");

  if (req.user.role !== "admin" && !report.user.equals(req.user._id)) {
    throw new AppError(httpStatus.FORBIDDEN, "Access denied");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Report fetched",
    data: report,
  });
});

export const handleReport = catchAsync(async (req, res) => {
  let userId = req.user._id;
  if (!userId)
    throw new AppError(httpStatus.FORBIDDEN, "You  need to pass the token");

  const { id } = req.params;
  const { status, notes } = req.body;

  const report = await Report.findById(id).populate("order");

  if (!report) throw new AppError(httpStatus.NOT_FOUND, "Report not found");

  report.status = status;

  if (notes) report.notes = notes;
  await report.save();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Report ${status}`,
    data: report,
  });
});

export const deleteReport = catchAsync(async (req, res) => {
  const report = await Report.findById(req.params.id);

  if (!report) throw new AppError(httpStatus.NOT_FOUND, "Report not found");

  if (req.user.role !== "admin" && !report.user.equals(req.user._id)) {
    throw new AppError(httpStatus.FORBIDDEN, "Access denied");
  }

  await Report.findByIdAndDelete(req.params.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Report deleted",
  });
});
