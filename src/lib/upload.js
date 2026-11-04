const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');
const { DATA_DIR } = require('../db');

const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
for (const sub of ['avatars', 'events', 'divisions', 'partners', 'docs']) {
  fs.mkdirSync(path.join(UPLOAD_DIR, sub), { recursive: true });
}

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const userError = (message) => Object.assign(new Error(message), { expose: true });

// File giữ trong bộ nhớ; ảnh luôn được mã hóa lại bằng sharp nên metadata/mã độc bị loại bỏ
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, fieldSize: 6 * 1024 * 1024, files: 4, fields: 60 },
  fileFilter(req, file, cb) {
    const ok = IMAGE_TYPES.includes(file.mimetype) || file.mimetype === 'application/pdf';
    cb(ok ? null : userError('Định dạng file không được hỗ trợ (chỉ JPG, PNG, WebP, PDF).'), ok);
  },
});

function newName(ext) {
  return `${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}.${ext}`;
}

async function saveImage(buffer, sub, { width, height, fit = 'inside' } = {}) {
  const name = newName('webp');
  try {
    await sharp(buffer, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width, height, fit, withoutEnlargement: fit === 'inside' })
      .webp({ quality: 82 })
      .toFile(path.join(UPLOAD_DIR, sub, name));
  } catch {
    throw userError('Không đọc được file ảnh, vui lòng chọn ảnh khác.');
  }
  return `/uploads/${sub}/${name}`;
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
  const name = newName('pdf');
  fs.writeFileSync(path.join(UPLOAD_DIR, 'docs', name), file.buffer);
  return `/uploads/docs/${name}`;
}

function removeUpload(publicPath) {
  if (!publicPath || !publicPath.startsWith('/uploads/')) return;
  const full = path.join(UPLOAD_DIR, publicPath.slice('/uploads/'.length));
  if (full.startsWith(UPLOAD_DIR)) fs.rm(full, { force: true }, () => {});
}

function fileOf(req, field) {
  return (req.files || []).find((f) => f.fieldname === field) || null;
}

module.exports = { upload, saveImage, saveAvatar, savePdf, removeUpload, fileOf, UPLOAD_DIR };
