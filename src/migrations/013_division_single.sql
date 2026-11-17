-- Nội dung thi đấu đơn (1 VĐV): thêm loại 'single'; đăng ký nội dung đơn không có VĐV 2
ALTER TABLE divisions DROP CONSTRAINT IF EXISTS divisions_team_type_check;
ALTER TABLE divisions ADD CONSTRAINT divisions_team_type_check CHECK (team_type IN ('single', 'pair', 'team'));
ALTER TABLE registrations ALTER COLUMN name2 DROP NOT NULL;
ALTER TABLE registrations ALTER COLUMN phone2 DROP NOT NULL;
