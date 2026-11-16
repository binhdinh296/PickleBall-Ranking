-- Giới hạn trình tối thiểu mỗi VĐV của nội dung thi đấu (thang 1.0 … 5.5+, lưu theo phần nghìn như điểm)
ALTER TABLE divisions ADD COLUMN min_player_points integer;
