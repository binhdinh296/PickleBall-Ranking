-- Hệ thống dùng nội bộ: bỏ toàn bộ OTP (bảng nhật ký mã, cờ đã xác minh, cấu hình nhà cung cấp SMS)
DROP TABLE IF EXISTS otp_requests;
ALTER TABLE registrations DROP COLUMN IF EXISTS phone_verified;
ALTER TABLE submissions DROP COLUMN IF EXISTS phone_verified;
DELETE FROM settings WHERE key LIKE 'otp\_%' OR key IN ('require_otp_submission', 'require_otp_registration');
