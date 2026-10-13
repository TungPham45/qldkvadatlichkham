# Quản lý đặt lịch phòng khám

Hệ thống phase 1 gồm cổng bệnh nhân, đăng ký ca của bác sĩ, duyệt ca và đặt khám. Trình duyệt chỉ gọi API Gateway. Redis chỉ dùng trong appointment-service để khóa slot và nhớ tạm khung giờ trống.

## Máy cần có gì

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) đang chạy
- Node.js khi sửa code hoặc chạy `npm test`
- Cổng trống: `5173`, `3000`–`3004`, `3010`, `3013`, `5433`, `6379`

Copy cả thư mục project sang máy mới. Không cần tạo database bằng tay. Máy mới thiếu `.env` thì copy `.env.example` thành `.env`.

## Sửa code

Mở terminal tại thư mục gốc của project, không phải thư mục `frontend`.

```bash
npm run dev
```

Lệnh này tắt các container app (auth, patient, staff, appointment, gateway, frontend) nếu chúng đang chiếm cổng, bật PostgreSQL và Redis, rồi chạy app trên máy host với watch:

| Process | Cổng |
| --- | --- |
| auth-service | 3001 |
| patient-service | 3002 |
| staff-service | 3003 |
| appointment-service | 3004 |
| medical-record-service | 3010 |
| notification-service | 3013 |
| API Gateway | 3000 |
| frontend (Vite) | 5173 |

Sửa TypeScript hoặc giao diện thì process tương ứng tự tải lại. Postgres trên máy host là `localhost:5433`, Redis là `localhost:6379`, đúng với `.env`.

Database `qlphongkham` được tạo từ `qlphongkham.sql`, rồi chạy thêm `database/migrations/001_schedule_workflow.sql`. Hai file SQL chỉ chạy khi volume Postgres còn trống.

Mở http://localhost:5173. Vite chuyển `/api` sang gateway ở cổng 3000.

Dừng app bằng Ctrl+C. Postgres và Redis vẫn chạy. Tắt hai container đó:

```bash
docker compose stop
```

## Chạy bản đã build

Dùng khi không sửa code. Dừng `npm run dev` trước, vì hai cách cùng chiếm cổng 3000–3004 và 5173.

```bash
npm run stack
```

Lệnh này là `docker compose --profile app up -d --build`. Profile `app` bật auth-service, patient-service, staff-service, appointment-service, API Gateway và giao diện nginx, cùng Postgres và Redis. Các service trong container nối Postgres qua host `postgres` cổng `5432` và Redis qua host `redis`. `medical-record-service` và `notification-service` không nằm trong profile này.

Đợi container khỏe:

```bash
docker compose --profile app ps
```

Mở http://localhost:5173 khi `qlpk-frontend` đã healthy. Sửa code xong muốn thấy trên bản Docker thì chạy lại `npm run stack`.

Tắt cả cụm:

```bash
docker compose --profile app stop
```

## File cấu hình

| File | Việc của file |
| --- | --- |
| `.env` | Cổng, bí mật JWT, token nội bộ. `npm run dev` đọc file này. Profile `app` ghi đè host Postgres và Redis bằng tên container. |
| `.env.example` | Bản mẫu của `.env`. Máy mới thiếu `.env` thì copy file này thành `.env`. |
| `frontend/.env` | Tên phòng khám trên giao diện: `VITE_HOSPITAL_NAME`, `VITE_HOSPITAL_SUBTITLE`. `VITE_HOSPITAL_HOTLINE` chỉ hiện khi có giá trị. |

Đổi tên phòng khám xong thì build lại giao diện, vì Vite đọc `frontend/.env` lúc tạo bản tĩnh:

```bash
docker compose --profile app up -d --build frontend
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
| medical-record-service | http://localhost:3010, chỉ khi `npm run dev` |
| notification-service | http://localhost:3013, chỉ khi `npm run dev` |
| PostgreSQL | localhost:5433, database `qlphongkham`, user/password `postgres` / `postgres` |
| Redis | localhost:6379 |

Frontend đã được cấu hình để gọi `/api` qua gateway. Không gọi thẳng các service.

## Tài khoản có sẵn

Mật khẩu của mọi tài khoản seed: `123456`

| Tài khoản | Màn hình sau khi đăng nhập |
| --- | --- |
| bn1 | Cổng bệnh nhân: đặt khám và xem lịch của mình |
| bs1 … bs15 | Bác sĩ: đăng ký / xem ca làm việc (đã có lịch mẫu 3 tuần tới) |
| admin | Quản lý: duyệt ca bác sĩ |

Seed có **15 bác sĩ** (bs1–bs15), **8 chuyên khoa**, xen kẽ nhận BHYT / không BHYT. Đăng ký công khai trên `/register` chỉ tạo bệnh nhân. Bác sĩ và quản lý không tự đăng ký.

## Reset database (giữ dữ liệu mẫu)

Seed nằm trong `database/qlphongkham.sql` và được Docker nạp tự động khi volume Postgres **trống**. Muốn khởi tạo lại DB (xóa hết rồi nạp lại seed):

```bash
npm run db:reset
```

Lệnh này chạy `docker compose down -v` rồi bật lại Postgres/Redis. Lần khởi động tiếp theo lại có đầy đủ bác sĩ, bệnh nhân và lịch mẫu.

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

## Xóa dữ liệu

`docker compose --profile app down -v` xóa dữ liệu Postgres, kể cả tài khoản và lịch đã tạo. Lần bật Postgres tiếp theo sẽ nạp lại SQL gốc.
