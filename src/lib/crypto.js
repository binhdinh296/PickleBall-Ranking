const crypto = require('crypto');
const { IS_PROD } = require('./env');

// Khóa ứng dụng dùng để mã hóa token YouTube, stream key và băm OTP
function appKey() {
  const secret = process.env.APP_SECRET;
  if (!secret || secret.length < 32) {
    if (IS_PROD) throw new Error('APP_SECRET phải dài ít nhất 32 ký tự');
    return crypto.createHash('sha256').update('dev-only-app-secret').digest();
  }
  return crypto.createHash('sha256').update(secret).digest();
}

function encrypt(plain) {
  if (plain === null || plain === undefined || plain === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', appKey(), iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${data.toString('base64url')}`;
}

function decrypt(token) {
  if (!token) return null;
  const [v, iv, tag, data] = String(token).split('.');
  if (v !== 'v1') return null;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', appKey(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

function hmac(value) {
  return crypto.createHmac('sha256', appKey()).update(String(value)).digest('hex');
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

module.exports = { encrypt, decrypt, hmac, safeEqual };
