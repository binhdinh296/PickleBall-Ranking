-- Lưu file tải lên (ảnh WebP đã nén lại, PDF điều lệ) trong CSDL khi máy chủ không có ổ đĩa ghi được
-- và chưa cấu hình Vercel Blob. Phục vụ qua /files/<thư mục>/<tên>.
CREATE TABLE IF NOT EXISTS stored_files (
  name text PRIMARY KEY,
  sub text NOT NULL,
  content_type text NOT NULL,
  data bytea NOT NULL,
  size integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
