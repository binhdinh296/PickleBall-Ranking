const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');
const { DATA_DIR, ensureDir } = require('../db');
const { IS_VERCEL } = require('./env');

// ---- Nơi lưu file ----
// • Có BLOB_READ_WRITE_TOKEN (Vercel Blob): lưu lên Blob, CSDL giữ URL đầy đủ https://….public.blob.vercel-storage.com/…
// • Không có: lưu vào ổ đĩa data/uploads, CSDL giữ đường dẫn /uploads/… (server thường, máy dev)
// Trên Vercel ổ đĩa chỉ đọc nên bắt buộc dùng Blob.
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const useBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;
const BLOB_HOST = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//i;

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const userError = (message) => Object.assign(new Error(message), { expose: true });

// Vercel giới hạn thân request 4,5 MB cho mỗi function → giữ file dưới mức đó để báo lỗi rõ ràng
const MAX_FILE = IS_VERCEL ? 4 * 1024 * 1024 : 8 * 1024 * 1024;

// File giữ trong bộ nhớ; ảnh luôn được mã hóa lại bằng sharp nên metadata/mã độc bị loại bỏ
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE, fieldSize: 6 * 1024 * 1024, files: 4, fields: 60 },
  fileFilter(req, file, cb) {
    const ok = IMAGE_TYPES.includes(file.mimetype) || file.mimetype === 'application/pdf';
    cb(ok ? null : userError('Định dạng file không được hỗ trợ (chỉ JPG, PNG, WebP, PDF).'), ok);
  },
});

function newName(ext) {
  return `${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}.${ext}`;
}

// Ghi 1 file đã xử lý, trả về địa chỉ lưu trong CSDL
async function store(sub, name, buffer, contentType) {
  if (useBlob()) {
    const { put } = require('@vercel/blob');
    const blob = await put(`${sub}/${name}`, buffer, {
      access: 'public', contentType, addRandomSuffix: false, cacheControlMaxAge: 31536000,
    });
    return blob.url;
  }
  if (IS_VERCEL) throw userError('Máy chủ chưa cấu hình nơi lưu ảnh (Vercel Blob). Liên hệ quản trị kỹ thuật.');
  fs.writeFileSync(path.join(ensureDir(path.join(UPLOAD_DIR, sub)), name), buffer);
  return `/uploads/${sub}/${name}`;
}

async function saveImage(buffer, sub, { width, height, fit = 'inside' } = {}) {
  let out;
  try {
    out = await sharp(buffer, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width, height, fit, withoutEnlargement: fit === 'inside' })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw userError('Không đọc được file ảnh, vui lòng chọn ảnh khác.');
  }
  return store(sub, newName('webp'), out, 'image/webp');
}

// Ảnh đại diện: nhận data URL đã cắt từ Cropper.js hoặc file gốc, lưu 300×300 WebP
async function saveAvatar({ dataUrl, file }) {
  let buffer = null;
  if (dataUrl) {
    const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!m) throw userError('Ảnh đại diện không hợp lệ');
    buffer = Buffer.from(m[2], 'base64');
    if (buffer.length > 5 * 1024 * 1024) throw userError('Ảnh đại diện quá lớn');
  } else if (file && IMAGE_TYPES.includes(file.mimetype)) {
    buffer = file.buffer;
  }
  if (!buffer) return null;
  return saveImage(buffer, 'avatars', { width: 300, height: 300, fit: 'cover' });
}

async function savePdf(file) {
  if (!file || file.mimetype !== 'application/pdf') return null;
  if (file.buffer.subarray(0, 5).toString() !== '%PDF-') throw userError('File điều lệ không phải PDF hợp lệ');
  return store('docs', newName('pdf'), file.buffer, 'application/pdf');
}

// Xóa file cũ (không chặn luồng chính; lỗi xóa chỉ ghi log)
function removeUpload(stored) {
  if (!stored) return;
  if (BLOB_HOST.test(stored)) {
    if (!useBlob()) return;
    const { del } = require('@vercel/blob');
    del(stored).catch((err) => console.error('[upload] xóa blob', err.message));
    return;
  }
  if (!stored.startsWith('/uploads/') || IS_VERCEL) return;
  const full = path.join(UPLOAD_DIR, stored.slice('/uploads/'.length));
  if (full.startsWith(UPLOAD_DIR + path.sep)) fs.rm(full, { force: true }, () => {});
}

function fileOf(req, field) {
  return (req.files || []).find((f) => f.fieldname === field) || null;
}

module.exports = { upload, saveImage, saveAvatar, savePdf, removeUpload, fileOf, UPLOAD_DIR, useBlob };
