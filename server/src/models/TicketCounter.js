/**
 * @file TicketCounter.js
 * @description Định nghĩa Mongoose Schema lưu bộ đếm số thứ tự tăng dần cho mã Ticket theo từng năm.
 * Vai trò trong kiến trúc Backend: Thuộc tầng Model (Mongoose ODM), kết hợp với cập nhật nguyên tử ($inc)
 * để cấp phát mã `HD-YYYY-NNNNNN` duy nhất, không trùng lặp khi tạo nhiều ticket đồng thời.
 */
import { Schema, createModel } from "../config/database.js";

/**
 * Schema bộ đếm Ticket, ánh xạ trực tiếp tới collection `ticket_counters`.
 */
const ticketCounterSchema = new Schema(
  {
    // Khóa định danh bộ đếm theo năm (ví dụ: "ticket_2026")
    _id: {
      type: String,
      required: true,
    },
    // Năm tương ứng với bộ đếm
    year: {
      type: Number,
      required: true,
    },
    // Giá trị số thứ tự hiện tại (>= 0), tăng lên mỗi khi sinh mã ticket mới
    sequence: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: "ticket_counters",
  },
);

// Khởi tạo và xuất Mongoose Model "TicketCounter"
const TicketCounter = createModel("TicketCounter", ticketCounterSchema);

export default TicketCounter;
