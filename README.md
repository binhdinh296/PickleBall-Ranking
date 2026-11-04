# PickleRank – Hệ thống ranking, giải đấu & livestream Pickleball

Website xếp hạng vận động viên (VĐV) và quản lý giải đấu Pickleball. Có CMS quản trị theo tài khoản và livestream qua YouTube xem ngay trên web. Giao diện **mobile-first**, có 2 theme tối/sáng.

- **Stack:** Node.js (Express + EJS, render phía server) và PostgreSQL.
- **Ảnh:** xử lý bằng `sharp`.
- **Livestream:** dùng YouTube Data API v3.

> "PickleRank" là tên tạm. Đổi tên, màu và nội dung trong **CMS › Cấu hình**. Toàn bộ dữ liệu mẫu là hư cấu.

## Tính năng

| Phân hệ | Tính năng |
| --- | --- |
| Ranking | Trang chủ (bảng vàng, giải nổi bật, đang live) · Bảng xếp hạng (lọc Nam/Nữ, tìm kiếm, phân trang) · Hồ sơ VĐV (điểm hiện tại / cao nhất / Lock, biểu đồ, lịch sử điểm, thành tích, lịch sử thi đấu kèm link xem lại) · Tự chấm trình (cắt ảnh 300×300, xác minh OTP) |
| Giải đấu | Danh sách theo trạng thái · Trang giải (giải thưởng, điều lệ PDF, nhóm Zalo, bảng vinh danh) · Đăng ký đôi (tự điền theo SĐT, kiểm tra tổng trình/giới tính/số đôi, OTP) · Danh sách đăng ký (không lộ SĐT) · Nhánh đấu loại trực tiếp (có bye, tự đẩy đội thắng) · Vòng tròn đồng đội tiếp sức (xếp hạng thắng → hiệu số → đối đầu/bảng phụ) |
| Livestream | Kết nối kênh YouTube bằng OAuth · Tạo buổi phát theo sân (tự lưu video lên kênh khi kết thúc) · Stream key RTMP cho OBS (chỉ quản trị viên xem, có ghi nhật ký) · Trang xem trực tiếp trên web + tỉ số cập nhật · Lớp tỉ số trong suốt cho OBS · Xem lại từng trận đúng mốc thời gian |
| CMS | Tổng quan · VĐV & điều chỉnh điểm (tôn trọng Lock) · Duyệt đơn chấm trình · Giải / nội dung / đăng ký (xuất CSV) · Bốc thăm, nhánh đấu, nhập tỉ số trên điện thoại · Vinh danh (gợi ý tự động) · Livestream · Đối tác · Cấu hình (màu thương hiệu, OTP, đầu số) · Tài khoản & phân quyền · Nhật ký thao tác · Nhật ký OTP |
| Dịch vụ chung | Kiểm tra SĐT di động Việt Nam theo đầu số nhà mạng (sửa được trong CMS) · Gửi/xác minh OTP (giả lập hoặc eSMS) · Upload ảnh an toàn (mã hóa lại WebP, xóa metadata/GPS) |

**Vai trò trong CMS:**

| Vai trò | Quyền |
| --- | --- |
| Quản trị viên | Toàn quyền |
| Biên tập viên | VĐV, giải, livestream, đối tác |
| Trọng tài | Chỉ nhập tỉ số |

## Chạy thử trên máy (5 phút)

Yêu cầu: **Node.js ≥ 22.9**. Không cần cài PostgreSQL: chế độ dev tự chạy một PostgreSQL nhúng trong `data/pg`.

```bash
npm install
```

```bash
npm run dev
```

- Website: <http://localhost:3000>
- CMS: <http://localhost:3000/admin>
- **Mật khẩu quản trị ban đầu** được ghi trong `data/initial-admin.txt` (chỉ máy bạn đọc được). Đăng nhập xong, đổi mật khẩu ở mục *Tài khoản của tôi* rồi xóa file này.
- OTP đang ở chế độ **giả lập**: mã hiện ngay trên form để thử, không gửi tin nhắn thật.
- Xóa thư mục `data/` để làm lại từ đầu với dữ liệu mẫu mới.
- **Ảnh mẫu:** dữ liệu mẫu có sẵn avatar VĐV, banner giải, banner nội dung, logo đối tác. Đây là ảnh minh họa cách điệu do `scripts/fake-images.js` vẽ (SVG → WebP), không phải ảnh người thật. Các lệnh:
  - Điền ảnh cho mục còn trống: `npm run fake-images`
  - Vẽ lại một nhóm ảnh: `npm run fake-images -- --force --only=divisions,partners` (nhóm: `avatars`, `events`, `divisions`, `partners`)
  - Khi lên production, thay bằng ảnh thật qua CMS.

### Bảng test theo vai trò: <http://localhost:3000/dev>

- **Đăng nhập nhanh 1 chạm** với vai trò Khách, Quản trị viên, Biên tập viên hoặc Trọng tài. Tài khoản `test_*` có mật khẩu ngẫu nhiên, chỉ vào được qua bảng này.
- **Nút "DEV · Xem với vai trò" trên menu chính** (header website và thanh trên CMS): đổi vai trò ngay ở trang đang xem, không cần mở `/dev`. Chọn vai trò CMS sẽ vào trang mặc định của vai trò đó; chọn "Khách" sẽ đăng xuất và ở lại trang công khai đang xem. Nút này tuân theo cùng điều kiện bật/tắt với `/dev` bên dưới.
- **2 khung xem song song**, mỗi khung chọn cỡ iPhone 390 / Android 360 / màn nhỏ 320 / tablet / desktop. Ví dụ: khung 1 cho trọng tài nhập tỉ số, khung 2 là trang xem live của khán giả.
- **27 kịch bản test** chia theo vai trò, kèm các bước làm và dữ liệu mẫu (bấm để chép). Đánh dấu "Đạt" hoặc "Ghi lỗi", tiến độ lưu trên trình duyệt.
- **Chỉ bật ở môi trường dev và chỉ mở được từ chính máy chạy server.** Khi `NODE_ENV=production` thì `/dev` trả 404 và trang không cho nhúng khung. Tắt hẳn ở dev bằng `TEST_PANEL=0`.

Chạy unit test:

```bash
npm test
```

## Cấu trúc thư mục

```
api/index.js           Điểm vào serverless khi chạy trên Vercel
vercel.json            Cấu hình Vercel (build, vùng chạy, cron)
src/
  server.js            Khởi tạo Express, bảo mật, session
  db.js                Kết nối PostgreSQL, giao dịch, migration
  migrations/          File SQL đánh số
  lib/                 phone (SĐT VN), otp, youtube, points (điểm/Lock), bracket (nhánh đấu),
                       upload (ảnh: ổ đĩa hoặc Vercel Blob), env (nhận biết production/Vercel), security (CSRF, phân quyền, rate limit), settings, format, crypto
  routes/              public, tournaments, live (API tỉ số, overlay), admin/*
views/                 EJS: public/*, admin/*, partials/*
public/css             app.css (token màu + layout mobile-first), admin.css, overlay.css
public/js              theme.js, app.js (SĐT, OTP, cắt ảnh, tự cập nhật), admin.js (nhập tỉ số…), overlay.js
scripts/               dev.js (Postgres nhúng), migrate.js, seed.js, vercel-build.js, fake-images.js
test/                  Unit test (node:test)
```

## Đổi giao diện / thương hiệu

Mọi màu sắc suy ra từ **3 màu gốc**:

| Màu gốc | Vai trò |
| --- | --- |
| `--ball` | Vàng chanh của quả bóng |
| `--court` | Xanh mặt sân |
| `--gold` | Vàng champagne cho thứ hạng |

- Đổi 3 màu trong **CMS › Cấu hình**. Gradient, màu chữ, giao diện sáng/tối đều tự cập nhật.
- Token chi tiết của từng theme nằm đầu file `public/css/app.css`.
- Font: **Be Vietnam Pro** (thiết kế riêng cho tiếng Việt) và **Playfair Display** nghiêng cho chữ nhấn.

## Triển khai production (server thường)

1. Chuẩn bị PostgreSQL ≥ 14 và Node.js ≥ 22.9.
2. Tạo `.env` từ `.env.example`:
   - `NODE_ENV=production`, `DATABASE_URL`, `APP_URL`.
   - `SESSION_SECRET` và `APP_SECRET`, mỗi chuỗi ≥ 32 ký tự (tạo bằng lệnh `openssl rand -hex 32`).
   - `ADMIN_PASSWORD` cho lần chạy đầu.
3. Cài đặt và tạo bảng:

   ```bash
   npm ci --omit=dev
   ```

   ```bash
   npm run migrate
   ```

   ```bash
   npm run seed
   ```

   Lệnh seed chỉ tạo tài khoản quản trị khi CSDL trống. Dữ liệu mẫu chỉ nạp nếu bảng VĐV trống: hãy xóa dữ liệu mẫu trong CMS trước khi mở cho người dùng thật.
4. Chạy `npm start` bằng PM2 hoặc systemd, đặt sau Nginx/Cloudflare có HTTPS, và đặt `TRUST_PROXY=1`.
5. Sao lưu hằng ngày: `pg_dump` cho CSDL và thư mục `data/uploads/` cho ảnh/PDF.

## Triển khai trên Vercel

Vercel chạy code dạng serverless: không có ổ đĩa ghi được và không có tiến trình chạy nền. Dự án đã được chỉnh để chạy được trong điều kiện này:

| Thành phần | Trên Vercel |
|---|---|
| Điểm vào | `api/index.js` (mọi đường dẫn được `vercel.json` chuyển về đây) |
| CSDL | PostgreSQL thuê ngoài: Neon hoặc Supabase (gắn từ tab **Storage** của Vercel) |
| Ảnh, PDF | Vercel Blob (gắn từ tab **Storage**) |
| Tạo bảng + tài khoản admin | Tự chạy trong bước build (`scripts/vercel-build.js`) |
| Dọn phiên hết hạn | Vercel Cron 1 lần/ngày (3:00 giờ VN) |
| Đồng bộ trạng thái live YouTube | Khi có người mở trang live/CMS livestream (tối đa 1 lần/phút) + cron hằng ngày |
| Vùng chạy | Singapore (`sin1`). Nên chọn CSDL ở cùng vùng Singapore. |

### Các bước

1. Đẩy mã nguồn lên một repo GitHub **riêng tư**, rồi vào Vercel → **Add New → Project → Import** repo đó. Không cần đổi Framework/Build settings (đã khai báo trong `vercel.json`).
2. Tab **Storage** của project: thêm **Neon** (Postgres, vùng Singapore) và **Blob**. Vercel tự thêm biến `DATABASE_URL` và `BLOB_READ_WRITE_TOKEN`.
3. **Settings → Environment Variables** (môi trường Production), thêm:

   | Biến | Giá trị |
   |---|---|
   | `SESSION_SECRET`, `APP_SECRET`, `CRON_SECRET` | Mỗi biến một chuỗi ngẫu nhiên riêng ≥ 32 ký tự (`openssl rand -hex 32`) |
   | `APP_URL` | Địa chỉ website, ví dụ `https://pickle-ball-ranking.vercel.app` |
   | `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Tài khoản CMS đầu tiên (mật khẩu ≥ 10 ký tự, có chữ và số) |
   | `SEED_DEMO=1` | *Tùy chọn, chỉ cho bản demo:* nạp dữ liệu mẫu hư cấu khi CSDL trống |
   | `ALLOW_MOCK_OTP=1`, `DEMO_SHOW_OTP=1` | *Tùy chọn, chỉ cho bản demo:* chưa có SMS thật thì dùng OTP giả lập và hiện mã ngay trên form |
   | `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET` | Khi kết nối YouTube (xem mục dưới) |
   | `ESMS_API_KEY`, `ESMS_SECRET_KEY` | Khi gửi OTP qua SMS thật |

4. **Deployments → Redeploy**. Log build phải có dòng `✔ Migration xong.` và `✔ Đã tạo tài khoản quản trị …`. Nếu thiếu biến, build dừng và báo rõ thiếu biến nào.
5. Đăng nhập `/admin`, đổi mật khẩu, rồi **xóa `ADMIN_PASSWORD`** khỏi Vercel. Bản demo: xóa luôn `SEED_DEMO`, `ALLOW_MOCK_OTP`, `DEMO_SHOW_OTP` trước khi có người dùng thật.

### Giới hạn khi chạy trên Vercel

- File tải lên tối đa **4 MB** (Vercel giới hạn 4,5 MB cho mỗi request).
- Gói Hobby chỉ cho cron chạy 1 lần/ngày, nên trạng thái buổi live tạo qua YouTube API được cập nhật khi có người mở trang live, không theo từng phút như server thường.
- Giới hạn tần suất gửi OTP/đăng nhập tính theo từng instance; chặn chính vẫn nằm ở CSDL (tối đa mã/SĐT/ngày, khóa tài khoản sau 5 lần sai).
- Bảng test `/dev` và nút "Xem với vai trò" luôn tắt trên Vercel.
- Lỗi khởi động (sai `DATABASE_URL`…) hiện trang "Hệ thống tạm thời chưa sẵn sàng"; chi tiết xem ở **Deployments → chọn bản deploy → Logs**.

## Kết nối YouTube (livestream lưu vào kênh của bạn)

1. Vào [Google Cloud Console](https://console.cloud.google.com/), tạo project và bật **YouTube Data API v3**.
2. Cấu hình **OAuth consent screen**. Nếu để ở chế độ *Testing*, Google thu hồi quyền sau 7 ngày, nên cần chuyển sang *In production* (hoặc dùng loại *Internal* nếu có Google Workspace).
3. Tạo **OAuth client ID** loại *Web application*, với Authorized redirect URI là `{APP_URL}/admin/livestream/youtube/callback`.
4. Điền `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `APP_URL` vào `.env` rồi khởi động lại server.
5. Trên kênh YouTube: bật **phát trực tiếp** trong YouTube Studio (lần đầu có thể chờ tới 24 giờ).
6. Vào **CMS › Livestream › Kết nối kênh YouTube** và đăng nhập đúng tài khoản Google sở hữu kênh. Nên dùng **kênh thương hiệu (Brand Account)** thay vì tài khoản cá nhân.

**Ngày thi đấu:**
1. Vào CMS › Livestream › *Tạo buổi phát*: mỗi sân, mỗi ngày một buổi.
2. Trong OBS › Cài đặt › Luồng › *Tùy chỉnh*, dán **Máy chủ** và **Stream key** lấy ở trang buổi phát (chỉ Quản trị viên xem được, mỗi lần xem đều ghi nhật ký). Máy chủ là địa chỉ `rtmps://…` (có mã hóa), không đổi sang `rtmp://`.
3. Thêm *Browser Source* là link **Lớp tỉ số OBS** (1920×1080) để hiện tỉ số trên hình.
4. Bắt đầu phát. YouTube tự chuyển trạng thái live, website hiện trình phát ở tab *Trực tiếp*.
5. Hết ngày thi đấu: dừng OBS rồi bấm **Kết thúc** ở trang buổi phát trong CMS. Buổi phát **không tự kết thúc** khi mất tín hiệu, để rớt mạng ở sân không làm đứt buổi phát. YouTube tự lưu video trên kênh, website dùng video đó cho *Xem lại*, kèm mốc thời gian từng trận (ghi khi trọng tài bấm *Bắt đầu*).

Lưu ý:
- YouTube chỉ tự lưu buổi live **dưới 12 giờ**.
- Chưa kết nối API thì vẫn dùng được: tạo buổi phát trong YouTube Studio rồi chọn *Dán link có sẵn*. Khi đó tự đổi trạng thái *Đang phát / Đã kết thúc* trong CMS.
- Chỉ dùng chế độ **Công khai** hoặc **Không công khai**: video *Riêng tư* không phát được trên website.
- Trình phát nhúng cần trình duyệt gửi địa chỉ trang (Referer); website đã đặt sẵn `Referrer-Policy: strict-origin-when-cross-origin`. Đừng đổi sang `no-referrer`, nếu không YouTube sẽ báo *Error 153*.

## OTP qua SMS

- Mặc định là **giả lập**. Trên production, chế độ giả lập bị chặn trừ khi đặt `ALLOW_MOCK_OTP=1`.
- Để gửi thật qua **eSMS.vn**:
  1. Đăng ký brandname với nhà mạng (cần thời gian duyệt).
  2. Đặt `ESMS_API_KEY` và `ESMS_SECRET_KEY` trong `.env`.
  3. Chọn nhà cung cấp và nhập brandname trong CMS › Cấu hình.
- **Cần đối chiếu tham số API trong `src/lib/otp.js` với tài liệu tài khoản eSMS của bạn trước khi chạy thật.**
- Muốn thêm nhà cung cấp khác (Zalo ZNS, SpeedSMS…), thêm một hàm vào `providers` trong `src/lib/otp.js`.
- Cơ chế bảo vệ:
  - Mã 6 số, hết hạn 5 phút, sai tối đa 5 lần.
  - Gửi lại sau 60 giây, tối đa 5 mã/SĐT/24 giờ, giới hạn theo IP.
  - Mã chỉ lưu dạng băm, SĐT trong log được che.

## Bảo mật & tuân thủ

- **Mật khẩu & phiên:** băm bằng scrypt; khóa 15 phút sau 5 lần đăng nhập sai; phiên lưu trong PostgreSQL, cookie `HttpOnly`/`SameSite`/`Secure`.
- **Chống tấn công web:** CSRF cho mọi thao tác ghi; CSP chặn script inline; chặn nhúng khung (trừ trang overlay); truy vấn tham số hóa.
- **Dữ liệu bí mật:** refresh token YouTube và stream key được mã hóa AES-256-GCM bằng `APP_SECRET`. Stream key bị xóa khi buổi phát kết thúc.
- **Upload:** chỉ nhận JPG/PNG/WebP/PDF ≤ 8 MB. Ảnh được mã hóa lại (loại metadata, GPS); PDF được kiểm tra đúng định dạng.
- **Dữ liệu cá nhân (Nghị định 13/2023):**
  - Form có ô đồng ý.
  - SĐT không hiển thị công khai.
  - Có cờ ẩn hồ sơ VĐV.
  - Trang chính sách tại `/chinh-sach-quyen-rieng-tu` **là bản nháp, cần bộ phận Pháp chế duyệt** trước khi công bố.
- **Không commit** `.env` và `data/`. Nếu lộ khóa (`APP_SECRET`, `ESMS_*`, `YOUTUBE_CLIENT_SECRET`, stream key): đổi ngay và báo đội ISMS/Security.

## Chưa có trong phiên bản này

- Tự sinh vòng *Playoff "cơ hội thứ 2"* (hiện tạo tay bằng *Thêm trận thủ công*).
- Tự cộng/trừ điểm theo kết quả trận (hiện điều chỉnh tay, có ghi lịch sử).
- Thanh toán lệ phí online, captcha chống spam, lưu ảnh trên S3/CDN, nhập VĐV từ Excel, OTP đăng nhập CMS.
