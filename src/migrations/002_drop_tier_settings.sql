-- Bỏ hệ hạng huy hiệu (Kim cương · Bạch kim · Vàng · Bạc · Đồng · Sắt): xóa các ngưỡng cấu hình không còn dùng
DELETE FROM settings WHERE key IN ('tier_diamond_min', 'tier_platinum_min', 'tier_gold_min', 'tier_silver_min', 'tier_bronze_min');
