import { IsDateString, IsEmail, IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Match } from '@qlpk/common';

export class RegisterDto {
  @IsString()
  @MaxLength(150)
  hoTen: string;

  @IsDateString()
  ngaySinh: string;

  @IsIn(['Nam', 'Nu', 'Khac'])
  gioiTinh: 'Nam' | 'Nu' | 'Khac';

  @Matches(/^0\d{9,10}$/, { message: 'Số điện thoại không hợp lệ.' })
  soDienThoai: string;

  @IsEmail({}, { message: 'Email không hợp lệ.' })
  @MaxLength(150)
  email: string;

  @IsString()
  @MaxLength(255)
  diaChi: string;

  @Matches(/^[a-zA-Z0-9._]{3,100}$/, { message: 'Tên đăng nhập chỉ gồm chữ, số, dấu chấm hoặc gạch dưới, từ 3 đến 100 ký tự.' })
  username: string;

  @IsString()
  @MinLength(6)
  @MaxLength(100)
  password: string;

  @IsString()
  @Match('password', { message: 'Mật khẩu xác nhận không khớp.' })
  confirmPassword: string;
}

export class LoginDto {
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  username: string;

  @IsString()
  @MinLength(6)
  @MaxLength(100)
  password: string;
}

export class RefreshDto {
  @IsString()
  refreshToken: string;
}
