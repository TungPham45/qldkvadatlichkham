# Quản lý đặt lịch phòng khám

Hệ thống phase 1 gồm cổng bệnh nhân, đăng ký ca của bác sĩ, duyệt ca và đặt khám. Trình duyệt chỉ gọi API Gateway. Redis chỉ dùng trong appointment-service để khóa slot và nhớ tạm khung giờ trống.

## Máy cần có gì

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) đang chạy
- [Node.js 20](https://nodejs.org/) trở lên, kèm npm
- Cổng trống: `5173`, `3000`–`3004`, `5433`, `6379`

Copy cả thư mục project sang máy mới. Không cần tạo database bằng tay.

## Khởi động lần đầu

Mở terminal tại thư mục project.

```bash
docker compose up -d
```

Lệnh này bật PostgreSQL và Redis. Database `qlphongkham` được tạo từ `qlphongkham.sql`, rồi chạy thêm `database/migrations/001_schedule_workflow.sql`. Hai file SQL chỉ chạy khi volume Postgres còn trống.

Postgres của project mở ở cổng **5433** trên máy host. File `.env` đã trỏ `DB_PORT=5433`.

Đợi hai container khỏe:

```bash
docker compose ps
```

`qlpk-postgres` và `qlpk-redis` cần ở trạng thái healthy. Sau đó:

```bash
npm install
npm run dev
```
npm run dev
`npm run dev` build gói dùng chung rồi chạy gateway, bốn service nghiệp vụ và frontend.

Mở http://localhost:5173.

## File cấu hình

| File | Việc của file |
| --- | --- |
| `.env` | Cổng, chuỗi kết nối Postgres, Redis, bí mật JWT. Service đọc file này ở thư mục gốc. |
| `.env.example` | Bản mẫu của `.env`. Máy mới thiếu `.env` thì copy file này thành `.env`. |
| `frontend/.env` | Tên phòng khám trên giao diện: `VITE_HOSPITAL_NAME`, `VITE_HOSPITAL_SUBTITLE`. `VITE_HOSPITAL_HOTLINE` chỉ hiện khi có giá trị. |

Đổi tên phòng khám xong thì tắt `npm run dev` và chạy lại, vì Vite đọc `frontend/.env` lúc khởi động.

## Địa chỉ khi đang chạy

| Thành phần | Địa chỉ |
| --- | --- |
| Giao diện | http://localhost:5173 |
| API Gateway | http://localhost:3000 |
| auth-service | http://localhost:3001 |
| patient-service | http://localhost:3002 |
| staff-service | http://localhost:3003 |
| appointment-service | http://localhost:3004 |
| PostgreSQL | localhost:5433, database `qlphongkham`, user/password `postgres` / `postgres` |
| Redis | localhost:6379 |

Frontend đã được cấu hình để gọi `/api` qua gateway. Không gọi thẳng các service.

## Tài khoản có sẵn

Mật khẩu của mọi tài khoản seed: `123456`

| Tài khoản | Màn hình sau khi đăng nhập |
| --- | --- |
| bn1 | Cổng bệnh nhân: đặt khám và xem lịch của mình |
| bs1 | Bác sĩ: đăng ký ca làm việc |
| admin | Quản lý: duyệt ca bác sĩ |

Đăng ký công khai trên `/register` chỉ tạo bệnh nhân. Bác sĩ và quản lý không tự đăng ký.

## Cách dùng lần đầu

1. Đăng nhập `bs1`, vào **Đăng ký lịch làm việc**, chọn ca ở một tuần phía trước, rồi gửi duyệt.
2. Đăng xuất, đăng nhập `admin`, vào **Duyệt lịch làm việc bác sĩ**, duyệt ca đó.
3. Đăng xuất, đăng nhập `bn1`, vào **Đặt khám**. Chỉ ca đã duyệt mới có giờ để chọn.

Ca chờ duyệt và ca bị từ chối không hiện cho bệnh nhân. Ca đã duyệt, kể cả dữ liệu cũ mang trạng thái `Active`, được dùng để mở giờ khám.

## Postman

Import `postman/dat-lich-benh-nhan.postman_collection.json`. Chọn **Desktop Agent** rồi chạy cả collection. Cloud Agent không gọi được `localhost`.

Collection tự đăng ký một ca sáng ở ngày hôm nay cộng 45 ngày, quản lý duyệt, bệnh nhân đặt slot trống đầu tiên, rồi kiểm tra đặt trùng.

## Lệnh khác

```bash
npm test
npm run smoke
npm run build
```

`npm test` kiểm tra sinh slot và khóa Redis. `npm run smoke` đi một vòng đăng ký ca, duyệt và đặt lịch; gateway, các service, Postgres và Redis phải đang chạy. `npm run build` tạo bản production của gateway, các service và frontend.

## Tắt và chạy lại

Tắt app bằng Ctrl+C trong terminal đang chạy `npm run dev`. Postgres và Redis vẫn chạy nền cho đến khi:

```bash
docker compose stop
```

Lần sau chỉ cần Docker Desktop đang mở, rồi:

```bash
docker compose up -d
npm run dev
```

`docker compose down -v` xóa dữ liệu Postgres, kể cả tài khoản và lịch đã tạo. Lần `up` tiếp theo sẽ nạp lại SQL gốc.
