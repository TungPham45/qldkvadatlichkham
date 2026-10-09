# Quản lý đặt lịch phòng khám

Hệ thống phase 1: cổng bệnh nhân, đăng ký lịch bác sĩ, duyệt lịch và đặt khám. Frontend chỉ gọi API Gateway. Redis chỉ dùng trong appointment-service để khóa slot và cache khung giờ.

## Chạy hạ tầng

Cổng PostgreSQL của máy đang dùng 5432, nên Postgres của project map ra **5433**.

```bash
docker compose up -d
```

Schema gốc nằm ở `qlphongkham.sql`. Migration cộng thêm `database/migrations/001_schedule_workflow.sql` chạy sau file gốc khi volume Postgres còn trống.

## Chạy ứng dụng

```bash
npm install
npm run dev
```

- Frontend: http://localhost:5173
- API Gateway: http://localhost:3000
- auth-service: 3001
- patient-service: 3002
- staff-service: 3003
- appointment-service: 3004
- Redis: localhost:6379

## Tài khoản thử

Mật khẩu seed: `123456`

| Tài khoản | Vai trò giao diện | Vai trò trong database |
| --- | --- | --- |
| bn1 | Bệnh nhân | NguoiDung |
| bs1 | Bác sĩ | BacSi |
| admin | Quản lý | Admin, hồ sơ `quan_ly` |

Đăng ký công khai chỉ tạo bệnh nhân.

## Luồng kiểm thử

1. Bác sĩ `bs1` đăng ký ca tại `/doctor/schedule`.
2. Quản lý `admin` duyệt tại `/manager/doctor-schedules`.
3. Bệnh nhân đặt lịch tại `/patient/appointments/book`.

Ca `Cho duyet` và `Tu choi` không xuất hiện khi đặt lịch. Ca `Da duyet` và dữ liệu cũ `Active` được coi là đã duyệt.

```bash
npm test
npm run smoke
```

`npm run smoke` cần gateway, các service, Postgres và Redis đang chạy.
