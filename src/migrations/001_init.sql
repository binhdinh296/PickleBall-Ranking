-- Điểm trình lưu dạng số nguyên phần nghìn: 3.600 -> 3600

CREATE TABLE users (
  id serial PRIMARY KEY,
  username text UNIQUE NOT NULL,
  display_name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'editor' CHECK (role IN ('admin', 'editor', 'referee')),
  active boolean NOT NULL DEFAULT true,
  failed_logins integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE settings (
  key text PRIMARY KEY,
  value text
);

CREATE TABLE sessions (
  sid text PRIMARY KEY,
  data jsonb NOT NULL,
  expires timestamptz NOT NULL
);
CREATE INDEX idx_sessions_expires ON sessions(expires);

CREATE TABLE audit_logs (
  id bigserial PRIMARY KEY,
  user_id integer REFERENCES users(id) ON DELETE SET NULL,
  username text,
  action text NOT NULL,
  target text,
  detail text,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE athletes (
  id serial PRIMARY KEY,
  full_name text NOT NULL,
  nickname text,
  phone text UNIQUE,
  gender char(1) NOT NULL CHECK (gender IN ('M', 'F')),
  hometown text,
  club text,
  description text,
  avatar text,
  points integer NOT NULL DEFAULT 0,
  peak_points integer NOT NULL DEFAULT 0,
  featured boolean NOT NULL DEFAULT false,
  visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_athletes_points ON athletes(points DESC);

CREATE TABLE events (
  id serial PRIMARY KEY,
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  venue text,
  address text,
  start_date date NOT NULL,
  end_date date NOT NULL,
  banner text,
  regulation_pdf text,
  zalo_link text,
  description text,
  registration_open boolean NOT NULL DEFAULT true,
  featured boolean NOT NULL DEFAULT false,
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE point_history (
  id serial PRIMARY KEY,
  athlete_id integer NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  old_points integer NOT NULL,
  new_points integer NOT NULL,
  kind text NOT NULL DEFAULT 'adjust' CHECK (kind IN ('init', 'adjust', 'tournament')),
  note text,
  event_id integer REFERENCES events(id) ON DELETE SET NULL,
  author text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_history_athlete ON point_history(athlete_id);

CREATE TABLE submissions (
  id serial PRIMARY KEY,
  full_name text NOT NULL,
  nickname text,
  phone text NOT NULL,
  phone_verified boolean NOT NULL DEFAULT false,
  gender char(1) NOT NULL CHECK (gender IN ('M', 'F')),
  points integer NOT NULL,
  hometown text,
  club text,
  description text,
  avatar text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note text,
  athlete_id integer REFERENCES athletes(id) ON DELETE SET NULL,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE divisions (
  id serial PRIMARY KEY,
  event_id integer NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name text NOT NULL,
  subtitle text,
  banner text,
  team_type text NOT NULL DEFAULT 'pair' CHECK (team_type IN ('pair', 'team')),
  format text NOT NULL DEFAULT 'knockout' CHECK (format IN ('knockout', 'roundrobin')),
  max_teams integer,
  max_total_points integer,
  max_player_points integer,
  gender_rule text NOT NULL DEFAULT 'any' CHECK (gender_rule IN ('any', 'male', 'female', 'mixed')),
  prizes jsonb NOT NULL DEFAULT '[]',
  relay_legs integer NOT NULL DEFAULT 0,
  relay_step integer NOT NULL DEFAULT 11,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE registrations (
  id serial PRIMARY KEY,
  division_id integer NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
  athlete1_id integer REFERENCES athletes(id) ON DELETE SET NULL,
  name1 text NOT NULL,
  phone1 text NOT NULL,
  points1 integer NOT NULL,
  athlete2_id integer REFERENCES athletes(id) ON DELETE SET NULL,
  name2 text NOT NULL,
  phone2 text NOT NULL,
  points2 integer NOT NULL,
  phone_verified boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'approved', 'rejected')),
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_reg_division ON registrations(division_id);

CREATE TABLE teams (
  id serial PRIMARY KEY,
  division_id integer NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
  registration_id integer REFERENCES registrations(id) ON DELETE SET NULL,
  name text NOT NULL,
  athlete1_id integer REFERENCES athletes(id) ON DELETE SET NULL,
  athlete2_id integer REFERENCES athletes(id) ON DELETE SET NULL,
  members text,
  seed integer
);

CREATE TABLE live_streams (
  id serial PRIMARY KEY,
  event_id integer NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  court text NOT NULL,
  title text NOT NULL,
  youtube_video_id text,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'ended')),
  scheduled_start timestamptz,
  actual_start timestamptz,
  actual_end timestamptz,
  privacy text NOT NULL DEFAULT 'unlisted' CHECK (privacy IN ('public', 'unlisted')),
  via_api boolean NOT NULL DEFAULT false,
  youtube_stream_id text,
  ingestion_url text,
  stream_key_enc text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_live_event ON live_streams(event_id);

CREATE TABLE matches (
  id serial PRIMARY KEY,
  division_id integer NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
  round_order integer NOT NULL,
  round_name text NOT NULL,
  position integer NOT NULL,
  code text,
  team_a_id integer REFERENCES teams(id) ON DELETE SET NULL,
  team_b_id integer REFERENCES teams(id) ON DELETE SET NULL,
  score_a integer,
  score_b integer,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'done')),
  players_a text,
  players_b text,
  legs jsonb,
  current_leg integer,
  court text,
  live_stream_id integer REFERENCES live_streams(id) ON DELETE SET NULL,
  video_offset integer,
  next_match_id integer REFERENCES matches(id) ON DELETE SET NULL,
  next_slot char(1) CHECK (next_slot IN ('a', 'b')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_matches_division ON matches(division_id, round_order, position);

CREATE TABLE honors (
  id serial PRIMARY KEY,
  division_id integer NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
  place integer NOT NULL CHECK (place IN (1, 2, 3)),
  name1 text NOT NULL,
  athlete1_id integer REFERENCES athletes(id) ON DELETE SET NULL,
  name2 text,
  athlete2_id integer REFERENCES athletes(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE partners (
  id serial PRIMARY KEY,
  name text NOT NULL,
  logo text,
  url text,
  sort_order integer NOT NULL DEFAULT 0,
  visible boolean NOT NULL DEFAULT true
);

CREATE TABLE otp_requests (
  id bigserial PRIMARY KEY,
  phone text NOT NULL,
  purpose text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  verified_at timestamptz,
  used_at timestamptz,
  provider text NOT NULL,
  provider_status text,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_otp_phone ON otp_requests(phone, purpose, created_at DESC);
