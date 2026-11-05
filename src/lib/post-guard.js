// Phòng ngừa Vercel edge/proxy đổi redirect sang 307 (khiến trình duyệt gửi tiếp POST tới URL đích chỉ nhận GET):
// POST tới đường dẫn không nằm trong danh sách dưới đây sẽ bị đổi thành GET.
// THÊM ROUTE POST MỚI → phải khai báo tiền tố ở đây (test/core.test.js quét mọi route để kiểm tra).
const ALLOWED_POST_PREFIXES = [
  '/dev/', '/cham-trinh', '/api/', '/cron/',
  '/admin/login', '/admin/logout', '/admin/tai-khoan',
  '/admin/vdv', '/admin/don-cham-trinh',
  '/admin/giai-dau', '/admin/noi-dung', '/admin/dang-ky', '/admin/doi/', '/admin/tran', '/admin/trong-tai',
  '/admin/livestream', '/admin/doi-tac', '/admin/cau-hinh', '/admin/nguoi-dung',
];

function isPostAllowed(path) {
  // /giai-dau/:slug/dang-ky (đăng ký thi đấu công khai)
  return ALLOWED_POST_PREFIXES.some((p) => path.startsWith(p)) || path.includes('/dang-ky');
}

function postGuard(req, res, next) {
  if (req.method === 'POST' && !isPostAllowed(req.path)) req.method = 'GET';
  next();
}

module.exports = { ALLOWED_POST_PREFIXES, isPostAllowed, postGuard };
