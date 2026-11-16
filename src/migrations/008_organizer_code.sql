-- Mỗi đơn vị có mã ngắn cho link đăng ký công khai: <tên miền>/<mã>/dangky (vd. /hmopen/dangky).
-- Link tạo giải gộp vào link quản lý (mở link quản lý khi chưa có giải sẽ vào form tạo giải).
ALTER TABLE organizers ADD COLUMN code text UNIQUE;
ALTER TABLE organizers DROP COLUMN create_token_hash;
