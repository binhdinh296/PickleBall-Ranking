const crypto = require('crypto');
const { get, all, run } = require('../db');
const { encrypt, decrypt } = require('./crypto');

// Kết nối kênh YouTube của ban tổ chức qua OAuth 2.0 (YouTube Data API v3).
// Buổi phát tạo với recordFromStart = true: khi kết thúc, YouTube tự lưu video trên kênh.
const SCOPE = 'https://www.googleapis.com/auth/youtube';
const API = 'https://www.googleapis.com/youtube/v3';

class YoutubeError extends Error {
  constructor(message) { super(message); this.expose = true; }
}

function configured() {
  return !!(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET && process.env.APP_URL);
}

function redirectUri() {
  return `${process.env.APP_URL.replace(/\/$/, '')}/admin/livestream/youtube/callback`;
}

function authUrl(req) {
  const state = crypto.randomBytes(16).toString('hex');
  req.session.ytState = state;
  const p = new URLSearchParams({
    client_id: process.env.YOUTUBE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function setKey(key, value) {
  if (value === null) return run('DELETE FROM settings WHERE key = ?', key);
  return run('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
}

async function account() {
  const rows = await all("SELECT key, value FROM settings WHERE key IN ('yt_channel_id','yt_channel_title','yt_connected_at','yt_refresh_token_enc')");
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return m.yt_refresh_token_enc
    ? { connected: true, channelId: m.yt_channel_id, channelTitle: m.yt_channel_title, connectedAt: m.yt_connected_at }
    : { connected: false };
}

let accessCache = null;

async function tokenRequest(params) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.YOUTUBE_CLIENT_ID, client_secret: process.env.YOUTUBE_CLIENT_SECRET, ...params }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('[youtube] token error', res.status, body.error);
    throw new YoutubeError(body.error === 'invalid_grant' ? 'Kết nối YouTube đã hết hiệu lực, vui lòng kết nối lại.' : 'Không xác thực được với Google.');
  }
  return body;
}

async function handleCallback(req) {
  if (!req.query.state || req.query.state !== req.session.ytState) throw new YoutubeError('Phiên kết nối YouTube không hợp lệ, vui lòng thử lại.');
  delete req.session.ytState;
  if (req.query.error) throw new YoutubeError('Bạn đã hủy cấp quyền YouTube.');
  const tok = await tokenRequest({ code: String(req.query.code || ''), grant_type: 'authorization_code', redirect_uri: redirectUri() });
  if (!tok.refresh_token) throw new YoutubeError('Google không trả về refresh token. Hãy gỡ quyền ứng dụng trong tài khoản Google rồi kết nối lại.');
  accessCache = { token: tok.access_token, exp: Date.now() + (tok.expires_in - 60) * 1000 };
  const ch = await api('GET', '/channels', { part: 'snippet', mine: 'true' });
  const channel = (ch.items || [])[0];
  if (!channel) throw new YoutubeError('Tài khoản Google này chưa có kênh YouTube.');
  await setKey('yt_refresh_token_enc', encrypt(tok.refresh_token));
  await setKey('yt_channel_id', channel.id);
  await setKey('yt_channel_title', channel.snippet.title);
  await setKey('yt_connected_at', new Date().toISOString());
  return { channelId: channel.id, channelTitle: channel.snippet.title };
}

async function disconnect() {
  const row = await get("SELECT value FROM settings WHERE key = 'yt_refresh_token_enc'");
  const refresh = row && decrypt(row.value);
  if (refresh) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refresh)}`, { method: 'POST', signal: AbortSignal.timeout(10000) }).catch(() => {});
  }
  for (const k of ['yt_refresh_token_enc', 'yt_channel_id', 'yt_channel_title', 'yt_connected_at']) await setKey(k, null);
  accessCache = null;
}

async function accessToken() {
  if (accessCache && accessCache.exp > Date.now()) return accessCache.token;
  const row = await get("SELECT value FROM settings WHERE key = 'yt_refresh_token_enc'");
  const refresh = row && decrypt(row.value);
  if (!refresh) throw new YoutubeError('Chưa kết nối kênh YouTube.');
  const tok = await tokenRequest({ refresh_token: refresh, grant_type: 'refresh_token' });
  accessCache = { token: tok.access_token, exp: Date.now() + (tok.expires_in - 60) * 1000 };
  return accessCache.token;
}

async function api(method, path, query = {}, body) {
  const token = await accessToken();
  const res = await fetch(`${API}${path}?${new URLSearchParams(query)}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  if (res.status === 204) return {};
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = data.error && data.error.errors && data.error.errors[0] && data.error.errors[0].reason;
    console.error('[youtube] api error', method, path, res.status, reason);
    const map = {
      liveStreamingNotEnabled: 'Kênh chưa bật tính năng phát trực tiếp. Bật trong YouTube Studio (lần đầu có thể chờ đến 24 giờ).',
      quotaExceeded: 'Đã vượt hạn mức YouTube API trong ngày.',
      invalidTransition: 'Buổi phát chưa ở trạng thái có thể kết thúc.',
    };
    throw new YoutubeError(map[reason] || 'YouTube từ chối yêu cầu. Kiểm tra lại kênh và quyền đã cấp.');
  }
  return data;
}

// Tạo buổi phát + luồng RTMP, gắn với nhau; trả về ID video và thông tin ingest cho OBS
async function createBroadcast({ title, description, scheduledStart, privacy }) {
  const broadcast = await api('POST', '/liveBroadcasts', { part: 'snippet,status,contentDetails' }, {
    snippet: { title: title.slice(0, 100), description: description || '', scheduledStartTime: new Date(scheduledStart || Date.now() + 5 * 60000).toISOString() },
    status: { privacyStatus: privacy === 'public' ? 'public' : 'unlisted', selfDeclaredMadeForKids: false },
    contentDetails: { enableAutoStart: true, enableAutoStop: true, enableDvr: true, recordFromStart: true, enableEmbed: true, latencyPreference: 'low' },
  });
  const stream = await api('POST', '/liveStreams', { part: 'snippet,cdn,contentDetails' }, {
    snippet: { title: `${title.slice(0, 80)} – luồng` },
    cdn: { ingestionType: 'rtmp', resolution: 'variable', frameRate: 'variable' },
    contentDetails: { isReusable: false },
  });
  await api('POST', '/liveBroadcasts/bind', { id: broadcast.id, part: 'id,contentDetails', streamId: stream.id });
  const info = stream.cdn.ingestionInfo || {};
  return { videoId: broadcast.id, streamId: stream.id, ingestionUrl: info.ingestionAddress, streamKey: info.streamName };
}

async function broadcastStatus(videoId) {
  const data = await api('GET', '/liveBroadcasts', { part: 'status,snippet', id: videoId });
  const item = (data.items || [])[0];
  if (!item) return null;
  return { lifeCycle: item.status.lifeCycleStatus, actualStart: item.snippet.actualStartTime, actualEnd: item.snippet.actualEndTime };
}

async function endBroadcast(videoId) {
  return api('POST', '/liveBroadcasts/transition', { broadcastStatus: 'complete', id: videoId, part: 'status' });
}

// Đồng bộ trạng thái các buổi tạo qua API: created/ready/testing → scheduled, live → live, complete/revoked → ended
async function syncStatuses() {
  if (!configured() || !(await account()).connected) return 0;
  const streams = await all("SELECT * FROM live_streams WHERE via_api AND status <> 'ended' AND youtube_video_id IS NOT NULL");
  let changed = 0;
  for (const s of streams) {
    try {
      const st = await broadcastStatus(s.youtube_video_id);
      if (!st) continue;
      const status = st.lifeCycle === 'live' ? 'live' : ['complete', 'revoked'].includes(st.lifeCycle) ? 'ended' : 'scheduled';
      if (status !== s.status) {
        await run(`UPDATE live_streams SET status = ?, actual_start = COALESCE(?, actual_start), actual_end = COALESCE(?, actual_end),
          stream_key_enc = CASE WHEN ? = 'ended' THEN NULL ELSE stream_key_enc END WHERE id = ?`,
        status, st.actualStart || null, st.actualEnd || null, status, s.id);
        changed++;
      }
    } catch (err) {
      console.error('[youtube] sync', s.id, err.message);
    }
  }
  return changed;
}

// Lấy ID video từ link YouTube bất kỳ hoặc ID trần
function parseVideoId(input) {
  const s = String(input || '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    if (!/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(u.hostname)) return null;
    if (u.hostname.endsWith('youtu.be')) return /^[A-Za-z0-9_-]{11}$/.test(u.pathname.slice(1)) ? u.pathname.slice(1) : null;
    const v = u.searchParams.get('v');
    if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
    const m = u.pathname.match(/\/(live|embed|shorts)\/([A-Za-z0-9_-]{11})/);
    return m ? m[2] : null;
  } catch {
    return null;
  }
}

module.exports = {
  configured, authUrl, handleCallback, disconnect, account, createBroadcast, broadcastStatus, endBroadcast,
  syncStatuses, parseVideoId, redirectUri, YoutubeError,
};
