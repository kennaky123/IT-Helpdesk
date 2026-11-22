/**
 * @fileoverview Bộ component bảng dữ liệu Table (UI primitives Shadcn-style).
 *
 * Mục đích & vai trò:
 * - Cung cấp các thành phần bảng chuẩn hóa (`Table`, `TableHeader`, `TableBody`, `TableRow`,
 *   `TableHead`, `TableCell`) kèm wrapper cuộn ngang (`overflow-x-auto`) và hiệu ứng hover đồng bộ.
 *
 * Props chung:
 * - `className` {string}: Class CSS tùy biến trộn qua `cn`.
 * - `...props`: Thuộc tính HTML của các thẻ bảng tương ứng (`table`, `thead`, `tbody`, `tr`, `th`, `td`).
 */
import { forwardRef } from "react";
import { cn } from "../../lib/utils.js";

/**
 * Thẻ bảng chính bọc trong container hỗ trợ cuộn ngang trên màn hình nhỏ.
 */
const Table = forwardRef(function Table({ className, ...props }, ref) {
  return (
    <div className="w-full overflow-x-auto">
      <table ref={ref} className={cn("w-full border-collapse text-left text-xs", className)} {...props} />
    </div>
  );
});

/**
 * Phần đầu bảng (`<thead>`) với nền xám nhạt và chữ in hoa đồng bộ.
 */
const TableHeader = forwardRef(function TableHeader({ className, ...props }, ref) {
  return (
    <thead
      ref={ref}
      className={cn("border-b border-brand-bone bg-brand-mist/70 text-[11px] font-bold tracking-wider text-brand-slate uppercase", className)}
      {...props}
    />
  );
});

/**
 * Phần thân bảng (`<tbody>`) tự động kẻ đường ngăn cách giữa các dòng.
 */
const TableBody = forwardRef(function TableBody({ className, ...props }, ref) {
  return <tbody ref={ref} className={cn("divide-y divide-brand-bone", className)} {...props} />;
});

/**
 * Một dòng dữ liệu (`<tr>`) có hiệu ứng đổi nền nhẹ khi di chuột.
 */
const TableRow = forwardRef(function TableRow({ className, ...props }, ref) {
  return (
    <tr
      ref={ref}
      className={cn("transition-colors hover:bg-brand-violet/[0.03]", className)}
      {...props}
    />
  );
});

/**
 * Ô tiêu đề cột (`<th>`).
 */
const TableHead = forwardRef(function TableHead({ className, ...props }, ref) {
  return <th ref={ref} className={cn("px-4 py-3 font-bold", className)} {...props} />;
});

/**
 * Ô dữ liệu (`<td>`) căn giữa theo chiều dọc.
 */
const TableCell = forwardRef(function TableCell({ className, ...props }, ref) {
  return <td ref={ref} className={cn("px-4 py-3.5 align-middle", className)} {...props} />;
});

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
