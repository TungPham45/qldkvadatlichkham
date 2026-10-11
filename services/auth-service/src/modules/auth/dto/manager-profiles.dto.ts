import { Type } from 'class-transformer';
import { IsDateString, IsEmail, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { accountStatuses, AccountStatus } from './accounts.dto';

export class ProfilesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  q?: string;

  @IsOptional()
  @IsIn(['Nam', 'Nu'])
  gioiTinh?: string;

  @IsOptional()
  @IsIn(accountStatuses)
  trangThai?: AccountStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 10;
}

class ProfileFieldsDto {
  @IsString()
  @MinLength(1)
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

  @IsIn(accountStatuses)
  trangThai: AccountStatus;
}

export class CreatePatientByManagerDto extends ProfileFieldsDto {
  @IsString()
  @MaxLength(255)
  diaChi: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  soBaoHiemYTe?: string;

  @Matches(/^[a-zA-Z0-9._]{3,100}$/)
  username: string;

  @IsString()
  @MinLength(6)
  @MaxLength(100)
  password: string;
}

export class UpdatePatientByManagerDto extends ProfileFieldsDto {
  @IsString()
  @MaxLength(255)
  diaChi: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  soBaoHiemYTe?: string;
}

export class CreateDoctorByManagerDto extends ProfileFieldsDto {
  @IsString()
  @MaxLength(255)
  bangCap: string;

  @IsString()
  @MaxLength(100)
  soChungChiHanhNghe: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  chuyenKhoaId: number;

  @Matches(/^[a-zA-Z0-9._]{3,100}$/)
  username: string;

  @IsString()
  @MinLength(6)
  @MaxLength(100)
  password: string;
}

export class UpdateDoctorByManagerDto extends ProfileFieldsDto {
  @IsString()
  @MaxLength(255)
  bangCap: string;

  @IsString()
  @MaxLength(100)
  soChungChiHanhNghe: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  chuyenKhoaId: number;
}
