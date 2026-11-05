-- Giao trận cho trọng tài: trọng tài chỉ nhập tỉ số trận được giao (trận chưa giao: mọi trọng tài đều nhập được)
ALTER TABLE matches ADD COLUMN IF NOT EXISTS referee_id integer REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS matches_referee_id_idx ON matches(referee_id);
