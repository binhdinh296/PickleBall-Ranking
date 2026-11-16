-- Đơn vị tổ chức (BTC) tự tạo và quản lý giải qua 2 link riêng (link tạo giải, link quản lý) + OTP về SĐT của đơn vị.
-- Chỉ lưu bản băm của mã trong link; link gốc chỉ hiện một lần lúc tạo/tạo lại.
CREATE TABLE organizers (
  id serial PRIMARY KEY,
  name text NOT NULL,
  contact_name text,
  phone text NOT NULL,
  note text,
  event_id integer UNIQUE REFERENCES events(id) ON DELETE SET NULL,
  create_token_hash text UNIQUE,
  manage_token_hash text UNIQUE,
  active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  created_by integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);
