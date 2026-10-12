# Quản lý đặt lịch phòng khám

Hệ thống phase 1 gồm cổng bệnh nhân, đăng ký ca của bác sĩ, duyệt ca và đặt khám. Trình duyệt chỉ gọi API Gateway. Redis chỉ dùng trong appointment-service để khóa slot và nhớ tạm khung giờ trống.

## Máy cần có gì

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) đang chạy
- Cổng trống: `5173`, `3000`–`3004`, `5433`, `6379`

Node.js chỉ cần khi chạy `npm test` trên máy host. App chạy bằng Docker Compose, không cần `npm run dev`.

Copy cả thư mục project sang máy mới. Không cần tạo database bằng tay.

## Khởi động lần đầu

Mở terminal tại thư mục gốc của project, không phải thư mục `frontend`.

```bash
docker compose up -d --build
```

Lệnh này bật PostgreSQL, Redis, auth-service, patient-service, staff-service, appointment-service, API Gateway và giao diện. Database `qlphongkham` được tạo từ `qlphongkham.sql`, rồi chạy thêm `database/migrations/001_schedule_workflow.sql`. Hai file SQL chỉ chạy khi volume Postgres còn trống.

Postgres của project mở ở cổng **5433** trên máy host. Trong container, service nối Postgres qua host `postgres` cổng `5432`. File `.env` trên máy host vẫn để `DB_PORT=5433` cho công cụ bên ngoài Docker.

Đợi các container khỏe:

```bash
docker compose ps
```

Mở http://localhost:5173 khi `qlpk-frontend` đã healthy.

## File cấu hình

| File | Việc của file |
| --- | --- |
| `.env` | Cổng, bí mật JWT, token nội bộ. Compose đọc file này. Host Postgres và Redis trong file bị Compose ghi đè bằng tên container. |
| `.env.example` | Bản mẫu của `.env`. Máy mới thiếu `.env` thì copy file này thành `.env`. |
| `frontend/.env` | Tên phòng khám trên giao diện: `VITE_HOSPITAL_NAME`, `VITE_HOSPITAL_SUBTITLE`. `VITE_HOSPITAL_HOTLINE` chỉ hiện khi có giá trị. |

Đổi tên phòng khám xong thì build lại giao diện, vì Vite đọc `frontend/.env` lúc tạo bản tĩnh:

```bash
docker compose up -d --build frontend
```

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

```bash
docker compose stop
```

Lần sau, Docker Desktop đang mở thì:

```bash
docker compose up -d
```

Sửa code service hoặc giao diện thì chạy lại `docker compose up -d --build` để image nhận bản mới.

`docker compose down -v` xóa dữ liệu Postgres, kể cả tài khoản và lịch đã tạo. Lần `up` tiếp theo sẽ nạp lại SQL gốc.
