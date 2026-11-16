-- Bỏ OTP khi mở link ban tổ chức: SĐT chỉ còn là thông tin liên hệ, không bắt buộc
ALTER TABLE organizers ALTER COLUMN phone DROP NOT NULL;
