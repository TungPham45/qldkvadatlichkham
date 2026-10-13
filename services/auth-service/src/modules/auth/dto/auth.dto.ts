import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEmail, IsIn, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

const bhytNumber = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim().toUpperCase();
  return trimmed || null;
};

export class RegisterDto {
  @IsString()
  @MaxLength(150)
  hoTen: string;

  @IsDateString()
  ngaySinh: string;

  @IsIn(['Nam', 'Nu'])
  gioiTinh: 'Nam' | 'Nu';

  @Matches(/^0\d{9,10}$/, { message: 'Số điện thoại không hợp lệ.' })
  soDienThoai: string;

  @IsEmail({}, { message: 'Email không hợp lệ.' })
  @MaxLength(150)
  email: string;

  @IsString()
  @MaxLength(255)
  diaChi: string;

  @Type(() => Boolean)
  @IsBoolean()
  coBhyt: boolean;

  @Transform(bhytNumber)
  @ValidateIf((dto: RegisterDto) => dto.coBhyt === true)
  @IsString({ message: 'Hãy nhập số thẻ BHYT để xác nhận có BHYT.' })
  @Matches(/^[A-Z0-9]{10,15}$/, { message: 'Số BHYT gồm 10–15 ký tự chữ hoặc số.' })
  soBhyt?: string | null;

  @Matches(/^[a-zA-Z0-9._]{3,100}$/, { message: 'Tên đăng nhập chỉ gồm chữ, số, dấu chấm hoặc gạch dưới, từ 3 đến 100 ký tự.' })
  username: string;

  @IsString()
  @MinLength(6)
  @MaxLength(100)
  password: string;

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

export class RequestPasswordResetDto {
  @Matches(/^0\d{9,10}$/, { message: 'Số điện thoại không hợp lệ.' })
  phone: string;
}

export class VerifyPasswordResetOtpDto extends RequestPasswordResetDto {
  @Matches(/^\d{6}$/, { message: 'Mã OTP phải gồm đúng 6 chữ số.' })
  otp: string;
}

export class ConfirmPasswordResetDto {
  @IsString()
  @MinLength(32)
  @MaxLength(200)
  resetToken: string;

  @IsString()
  @MinLength(6)
  @MaxLength(100)
  newPassword: string;

  @IsString()
  @MinLength(6)
  @MaxLength(100)
  confirmPassword: string;
}
