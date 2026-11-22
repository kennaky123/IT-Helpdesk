/**
 * @file categoryController.js
 * @description Controller quản lý danh mục sự cố/ticket (`Category`).
 * Vai trò Controller: Tiếp nhận HTTP request lấy danh sách danh mục hoạt động, danh sách
 * quản trị kèm thống kê số lượng ticket, tạo mới, cập nhật và xóa danh mục, đồng thời tự động
 * sinh slug tiếng Việt chuẩn hóa không trùng lặp.
 */
import Category from "../models/Category.js";
import Ticket from "../models/Ticket.js";
import ApiError from "../utils/ApiError.js";

/**
 * Chuyển đổi chuỗi tiếng Việt thành slug URL hợp lệ (không dấu, chữ thường, phân tách bằng dấu gạch ngang).
 *
 * @param {string} value - Tên danh mục gốc cần tạo slug.
 * @returns {string} Chuỗi slug đã chuẩn hóa, tối đa 100 ký tự.
 */
function createSlug(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

/**
 * Tạo slug duy nhất trong collection `Category`, tự thêm hậu tố số tăng dần nếu bị trùng.
 *
 * @param {string} name - Tên danh mục nguồn.
 * @param {string|import("mongoose").Types.ObjectId|null} [excludedId=null] - ID danh mục cần loại trừ khi cập nhật.
 * @returns {Promise<string>} Slug duy nhất hợp lệ.
 * @throws {ApiError} Lỗi 409 nếu thử 1000 hậu tố vẫn bị trùng.
 */
async function getUniqueSlug(name, excludedId = null) {
  const baseSlug = createSlug(name) || "danh-muc";
  for (let suffix = 0; suffix < 1000; suffix += 1) {
    const slug = suffix === 0 ? baseSlug : `${baseSlug}-${suffix + 1}`;
    const filter = { slug, ...(excludedId && { _id: { $ne: excludedId } }) };
    if (!(await Category.exists(filter))) return slug;
  }
  throw new ApiError(409, "Không thể tạo slug duy nhất cho danh mục.");
}

/**
 * Lấy danh sách các danh mục đang kích hoạt (`isActive: true`) cho người dùng tạo/lọc ticket.
 *
 * @param {import("express").Request} _request - HTTP request (không sử dụng).
 * @param {import("express").Response} response - HTTP response trả về danh sách danh mục đang bật.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200.
 */
export async function listActiveCategories(_request, response, next) {
  try {
    const categories = await Category.find({ isActive: true })
      .select("name slug description")
      .sort({ name: 1, _id: 1 })
      .lean();

    return response.status(200).json({
      success: true,
      message: "Lấy danh sách danh mục thành công.",
      data: { categories },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Lấy toàn bộ danh mục (kể cả đang ẩn) kèm số lượng ticket thuộc từng danh mục cho Admin.
 *
 * @param {import("express").Request} _request - HTTP request (không sử dụng).
 * @param {import("express").Response} response - HTTP response trả về danh sách danh mục quản trị.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200.
 */
export async function listAdminCategories(_request, response, next) {
  try {
    // Chạy song song truy vấn danh mục và aggregation đếm số ticket theo từng category
    const [categories, ticketCounts] = await Promise.all([
      Category.find().sort({ name: 1, _id: 1 }).lean(),
      Ticket.aggregate([{ $group: { _id: "$category", ticketCount: { $sum: 1 } } }]),
    ]);
    // Ánh xạ kết quả đếm để gắn nhanh trường ticketCount vào từng danh mục
    const countByCategory = new Map(ticketCounts.map((row) => [String(row._id), row.ticketCount]));
    return response.status(200).json({
      success: true,
      message: "Lấy danh sách danh mục quản trị thành công.",
      data: { categories: categories.map((category) => ({ ...category, ticketCount: countByCategory.get(String(category._id)) ?? 0 })) },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Tạo mới một danh mục ticket sau khi kiểm tra trùng tên không phân biệt hoa/thường.
 *
 * @param {import("express").Request} request - HTTP request chứa `{ name, description, isActive }` trong `body`.
 * @param {import("express").Response} response - HTTP response trả về danh mục vừa tạo.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 201.
 */
export async function createCategory(request, response, next) {
  try {
    // Kiểm tra trùng tên danh mục không phân biệt chữ hoa/thường (escape ký tự đặc biệt regex)
    const duplicate = await Category.exists({ name: new RegExp(`^${request.body.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
    if (duplicate) throw new ApiError(409, "Tên danh mục đã tồn tại.");

    const category = await Category.create({
      name: request.body.name,
      slug: await getUniqueSlug(request.body.name),
      description: request.body.description,
      isActive: request.body.isActive,
      createdBy: request.user._id,
      updatedBy: request.user._id,
    });
    return response.status(201).json({
      success: true,
      message: "Thêm danh mục thành công.",
      data: { category: { ...category.toObject(), ticketCount: 0 } },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Cập nhật thông tin danh mục và tái tạo slug nếu tên danh mục thay đổi.
 *
 * @param {import("express").Request} request - HTTP request chứa `params.categoryId` và payload cập nhật.
 * @param {import("express").Response} response - HTTP response trả về danh mục kèm `ticketCount`.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200.
 */
export async function updateCategory(request, response, next) {
  try {
    const category = await Category.findById(request.params.categoryId);
    if (!category) throw new ApiError(404, "Không tìm thấy danh mục.");

    // Kiểm tra tên mới có trùng với danh mục khác hay không
    const duplicate = await Category.exists({
      _id: { $ne: category._id },
      name: new RegExp(`^${request.body.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
    });
    if (duplicate) throw new ApiError(409, "Tên danh mục đã tồn tại.");

    // Chỉ sinh lại slug khi tên danh mục thay đổi
    const nameChanged = category.name !== request.body.name;
    category.name = request.body.name;
    category.description = request.body.description;
    category.isActive = request.body.isActive;
    category.updatedBy = request.user._id;
    if (nameChanged) category.slug = await getUniqueSlug(request.body.name, category._id);
    await category.save();
    const ticketCount = await Ticket.countDocuments({ category: category._id });

    return response.status(200).json({
      success: true,
      message: "Cập nhật danh mục thành công.",
      data: { category: { ...category.toObject(), ticketCount } },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Xóa danh mục khỏi hệ thống (chặn xóa nếu danh mục đã có ticket tham chiếu).
 *
 * @param {import("express").Request} request - HTTP request chứa `params.categoryId`.
 * @param {import("express").Response} response - HTTP response xác nhận xóa thành công.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200 chứa `categoryId`.
 */
export async function deleteCategory(request, response, next) {
  try {
    const category = await Category.findById(request.params.categoryId);
    if (!category) throw new ApiError(404, "Không tìm thấy danh mục.");
    // Bảo toàn toàn vẹn dữ liệu: từ chối xóa nếu đã có ticket gắn danh mục này
    if (await Ticket.exists({ category: category._id })) {
      throw new ApiError(409, "Không thể xóa danh mục đã có ticket. Hãy tạm ẩn danh mục.");
    }
    await Category.deleteOne({ _id: category._id });
    return response.status(200).json({
      success: true,
      message: "Xóa danh mục thành công.",
      data: { categoryId: String(category._id) },
    });
  } catch (error) {
    return next(error);
  }
}
