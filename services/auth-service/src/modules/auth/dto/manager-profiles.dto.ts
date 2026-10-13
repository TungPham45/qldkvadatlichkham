import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEmail, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { accountStatuses, AccountStatus } from './accounts.dto';

const bhytNumber = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim().toUpperCase();
  return trimmed || null;
};

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

export class PatientProfilesQueryDto extends ProfilesQueryDto {
  @IsOptional()
  @IsIn(['Nam', 'Nu', 'Khac'])
  gioiTinh: string | undefined = undefined;
}

class ProfileFieldsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  hoTen: string;

  @IsDateString()
  ngaySinh: string;

  @Matches(/^0\d{9,10}$/, { message: 'Số điện thoại không hợp lệ.' })
  soDienThoai: string;

  @IsEmail({}, { message: 'Email không hợp lệ.' })
  @MaxLength(150)
  email: string;

  @IsIn(accountStatuses)
  trangThai: AccountStatus;
}

class PatientProfileFieldsDto extends ProfileFieldsDto {
  @ValidateIf((_, value) => value !== null)
  @IsIn(['Nam', 'Nu', 'Khac'])
  gioiTinh: 'Nam' | 'Nu' | 'Khac' | null;
}

export class CreatePatientByManagerDto extends PatientProfileFieldsDto {
  @IsString()
  @MaxLength(255)
  diaChi: string;

  @Type(() => Boolean)
  @IsBoolean()
  coBhyt: boolean;

  @Transform(bhytNumber)
  @ValidateIf((dto: CreatePatientByManagerDto) => dto.coBhyt === true)
  @IsString({ message: 'Hãy nhập số thẻ BHYT để xác nhận có BHYT.' })
  @Matches(/^[A-Z0-9]{10,15}$/, { message: 'Số BHYT gồm 10–15 ký tự chữ hoặc số.' })
  soBhyt?: string | null;

  @Matches(/^[a-zA-Z0-9._]{3,100}$/)
  username: string;

  @IsString()
  @MinLength(6)
  @MaxLength(100)
  password: string;
}

export class UpdatePatientByManagerDto extends PatientProfileFieldsDto {
  @IsString()
  @MaxLength(255)
  diaChi: string;

  @Type(() => Boolean)
  @IsBoolean()
  coBhyt: boolean;

  @Transform(bhytNumber)
  @ValidateIf((dto: UpdatePatientByManagerDto) => dto.coBhyt === true)
  @IsString({ message: 'Hãy nhập số thẻ BHYT để xác nhận có BHYT.' })
  @Matches(/^[A-Z0-9]{10,15}$/, { message: 'Số BHYT gồm 10–15 ký tự chữ hoặc số.' })
  soBhyt?: string | null;
}

export class CreateDoctorByManagerDto extends ProfileFieldsDto {
  @IsIn(['Nam', 'Nu'])
  gioiTinh: 'Nam' | 'Nu';

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

  @Type(() => Boolean)
  @IsBoolean()
  nhanBhyt: boolean;

  @Matches(/^[a-zA-Z0-9._]{3,100}$/)
  username: string;

  @IsString()
  @MinLength(6)
  @MaxLength(100)
  password: string;
}

export class UpdateDoctorByManagerDto extends ProfileFieldsDto {
  @IsIn(['Nam', 'Nu'])
  gioiTinh: 'Nam' | 'Nu';

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

  @Type(() => Boolean)
  @IsBoolean()
  nhanBhyt: boolean;
}
