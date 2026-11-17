-- Nhánh đấu kiểu đồ thị (giống giaidau.pickna.vn): mỗi ô đội của trận có thể lấy
-- đội THẮNG hoặc đội THUA của một trận bất kỳ (vd. Playoff = Thua T1 gặp Thua T2),
-- hoặc chờ theo nhãn (vd. "T6 (Nhì bảng mini)") cho tới khi BTC gán đội.
ALTER TABLE matches ADD COLUMN IF NOT EXISTS src_a_match_id integer REFERENCES matches(id) ON DELETE SET NULL;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS src_a_kind text CHECK (src_a_kind IN ('winner', 'loser'));
ALTER TABLE matches ADD COLUMN IF NOT EXISTS src_b_match_id integer REFERENCES matches(id) ON DELETE SET NULL;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS src_b_kind text CHECK (src_b_kind IN ('winner', 'loser'));
ALTER TABLE matches ADD COLUMN IF NOT EXISTS label_a text;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS label_b text;
-- Giờ thi đấu dạng "HH:MM" (hiển thị 10h00)
ALTER TABLE matches ADD COLUMN IF NOT EXISTS start_time text;
-- Khu riêng ngoài sơ đồ chính (vd. "MINI"); NULL = sơ đồ chính theo cột vòng
ALTER TABLE matches ADD COLUMN IF NOT EXISTS zone text;

-- Chuyển nhánh cũ (chỉ đẩy đội thắng sang next_match_id/next_slot) sang cách mới
UPDATE matches t SET src_a_match_id = s.id, src_a_kind = 'winner'
  FROM matches s WHERE s.next_match_id = t.id AND s.next_slot = 'a' AND t.src_a_match_id IS NULL;
UPDATE matches t SET src_b_match_id = s.id, src_b_kind = 'winner'
  FROM matches s WHERE s.next_match_id = t.id AND s.next_slot = 'b' AND t.src_b_match_id IS NULL;

ALTER TABLE matches DROP COLUMN IF EXISTS next_match_id;
ALTER TABLE matches DROP COLUMN IF EXISTS next_slot;

CREATE INDEX IF NOT EXISTS idx_matches_src_a ON matches(src_a_match_id);
CREATE INDEX IF NOT EXISTS idx_matches_src_b ON matches(src_b_match_id);
