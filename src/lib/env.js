// Xác định môi trường chạy ở MỘT chỗ.
// Mọi bản deploy trên Vercel (production lẫn preview) đều coi là production: tắt bảng test /dev,
// không trả mã OTP thử nghiệm, bắt buộc APP_SECRET… bất kể NODE_ENV được đặt thế nào.
const IS_VERCEL = !!process.env.VERCEL;
const IS_PROD = process.env.NODE_ENV === 'production' || IS_VERCEL;

module.exports = { IS_VERCEL, IS_PROD };
