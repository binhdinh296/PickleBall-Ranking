const crypto = require('crypto');
const { get, run } = require('../db');
const { getSettings, num } = require('./settings');
const { hmac, safeEqual } = require('./crypto');
const phoneLib = require('./phone');

const PURPOSES = ['submission', 'registration', 'admin_login'];

class OtpError extends Error {
  constructor(message, extra = {}) {
    super(message);
    this.expose = true;
    Object.assign(this, extra);
  }
}

// ---- Nhà cung cấp gửi tin ----
// mock: không gửi thật, chỉ ghi log server (dùng khi phát triển/kiểm thử)
// esms: SMS brandname qua eSMS.vn — kiểm tra lại tham số theo tài liệu tài khoản của bạn trước khi chạy thật
const providers = {
  async mock({ phone, text }) {
    console.log(`[OTP mock] ${phoneLib.mask(phone)}: ${text}`);
    return { status: 'mock' };
  },
  async esms({ phone, text, brandname }) {
    const apiKey = process.env.ESMS_API_KEY;
    const secretKey = process.env.ESMS_SECRET_KEY;
    if (!apiKey || !secretKey) throw new OtpError('Chưa cấu hình ESMS_API_KEY / ESMS_SECRET_KEY trên server.');
    const res = await fetch('https://rest.esms.vn/MainService.svc/json/SendMultipleMessage_V4_post_json/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ApiKey: apiKey, SecretKey: secretKey, Phone: phone, Content: text, Brandname: brandname, SmsType: '2', IsUnicode: '0' }),
      signal: AbortSignal.timeout(10000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || String(body.CodeResult) !== '100') {
      console.error('[OTP esms] gửi lỗi', res.status, body.CodeResult, body.ErrorMessage);
      throw new OtpError('Không gửi được tin nhắn, vui lòng thử lại sau.');
    }
    return { status: `esms:${body.SMSID || 'ok'}` };
  },
};

function codeHash(phone, purpose, code) {
  return hmac(`${phone}|${purpose}|${code}`);
}

function isEnabled(purpose) {
  if (purpose === 'admin_login') return true;
  return getSettings().otp_enabled === '1';
}

async function send({ phone: rawPhone, purpose, ip }) {
  if (!PURPOSES.includes(purpose)) throw new OtpError('Mục đích OTP không hợp lệ.');
  const v = phoneLib.validate(rawPhone);
  if (!v.ok) throw new OtpError(v.error);
  const phone = v.phone;

  const cooldown = num('otp_cooldown_seconds') || 60;
  const last = await get(`SELECT created_at FROM otp_requests WHERE phone = ? AND purpose = ? ORDER BY created_at DESC LIMIT 1`, phone, purpose);
  if (last) {
    const wait = Math.ceil(cooldown - (Date.now() - new Date(last.created_at).getTime()) / 1000);
    if (wait > 0) throw new OtpError(`Vui lòng chờ ${wait} giây trước khi gửi lại mã.`, { retryAfter: wait });
  }
  const today = await get(`SELECT COUNT(*) AS c FROM otp_requests WHERE phone = ? AND created_at > now() - interval '24 hours'`, phone);
  if (today.c >= (num('otp_daily_limit') || 5)) throw new OtpError('Số điện thoại này đã nhận quá số mã cho phép trong 24 giờ.');

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const ttl = num('otp_ttl_seconds') || 300;
  const s = getSettings();
  const providerName = providers[s.otp_provider] ? s.otp_provider : 'mock';
  if (providerName === 'mock' && process.env.NODE_ENV === 'production' && process.env.ALLOW_MOCK_OTP !== '1') {
    throw new OtpError('Chưa cấu hình nhà cung cấp gửi OTP.');
  }
  const text = `${s.site_name}: ma xac minh cua ban la ${code}. Hieu luc ${Math.round(ttl / 60)} phut. Khong chia se ma nay.`;

  const row = await get(`INSERT INTO otp_requests(phone, purpose, code_hash, expires_at, provider, ip)
    VALUES (?, ?, ?, now() + make_interval(secs => ?), ?, ?) RETURNING id`, phone, purpose, codeHash(phone, purpose, code), ttl, providerName, ip || null);
  try {
    const result = await providers[providerName]({ phone, text, brandname: s.otp_brandname });
    await run('UPDATE otp_requests SET provider_status = ? WHERE id = ?', result.status, row.id);
  } catch (err) {
    await run("UPDATE otp_requests SET provider_status = 'error', used_at = now() WHERE id = ?", row.id);
    throw err instanceof OtpError ? err : new OtpError('Không gửi được mã, vui lòng thử lại sau.');
  }
  // Chế độ giả lập ngoài production: trả mã về để kiểm thử
  const devCode = providerName === 'mock' && process.env.NODE_ENV !== 'production' ? code : undefined;
  return { phone, carrier: v.carrier, cooldown, ttl, devCode };
}

// Xác minh mã; thành công thì đánh dấu đã dùng để không dùng lại được
async function verify({ phone: rawPhone, purpose, code }) {
  const v = phoneLib.validate(rawPhone);
  if (!v.ok) throw new OtpError(v.error);
  const clean = String(code || '').replace(/\D/g, '');
  if (clean.length !== 6) throw new OtpError('Mã OTP gồm 6 chữ số.');
  const row = await get(`SELECT * FROM otp_requests WHERE phone = ? AND purpose = ? AND used_at IS NULL
    ORDER BY created_at DESC LIMIT 1`, v.phone, purpose);
  if (!row) throw new OtpError('Bạn chưa nhận mã OTP hoặc mã đã được sử dụng. Vui lòng gửi mã mới.');
  if (new Date(row.expires_at) < new Date()) throw new OtpError('Mã OTP đã hết hạn. Vui lòng gửi mã mới.');
  const maxAttempts = num('otp_max_attempts') || 5;
  if (row.attempts >= maxAttempts) throw new OtpError('Bạn đã nhập sai quá số lần cho phép. Vui lòng gửi mã mới.');
  if (!safeEqual(row.code_hash, codeHash(v.phone, purpose, clean))) {
    await run('UPDATE otp_requests SET attempts = attempts + 1 WHERE id = ?', row.id);
    const left = maxAttempts - row.attempts - 1;
    throw new OtpError(left > 0 ? `Mã OTP không đúng, còn ${left} lần thử.` : 'Mã OTP không đúng. Vui lòng gửi mã mới.');
  }
  await run('UPDATE otp_requests SET verified_at = now(), used_at = now() WHERE id = ?', row.id);
  return { phone: v.phone };
}

module.exports = { send, verify, isEnabled, OtpError, PURPOSES, providerNames: Object.keys(providers) };
