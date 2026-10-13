import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEmail, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const nullableTrim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() || null : value;
const bhytNumber = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim().toUpperCase();
  return trimmed || null;
};

export const BHYT_NUMBER_PATTERN = /^[A-Z0-9]{10,15}$/;
export const BHYT_NUMBER_MESSAGE = 'Số BHYT gồm 10–15 ký tự chữ hoặc số.';

class PatientProfileFieldsDto {
  @Transform(nullableTrim)
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  ngaySinh?: string | null;

  @Transform(nullableTrim)
  @IsOptional()
  @IsIn(['Nam', 'Nu', 'Khac'])
  gioiTinh?: string | null;

  @Transform(nullableTrim)
  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  email?: string | null;

  @Transform(nullableTrim)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  diaChi?: string | null;
}

export class CreateOwnPatientDto extends PatientProfileFieldsDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  hoTen: string;

  @Transform(trim)
  @Matches(/^0\d{9,10}$/, { message: 'Số điện thoại bắt đầu bằng 0 và có 10 hoặc 11 chữ số.' })
  soDienThoai: string;

  @Type(() => Boolean)
  @IsBoolean()
  coBhyt: boolean;

  @Transform(bhytNumber)
  @ValidateIf((dto: CreateOwnPatientDto) => dto.coBhyt === true)
  @IsString({ message: 'Hãy nhập số thẻ BHYT để xác nhận có BHYT.' })
  @Matches(BHYT_NUMBER_PATTERN, { message: BHYT_NUMBER_MESSAGE })
  soBhyt?: string | null;
}

export class CreateRelativePatientDto extends CreateOwnPatientDto {
  @Transform(trim)
  @IsIn(['Bo', 'Me', 'Con', 'Vo', 'Chong', 'NguoiThan', 'NguoiChamSoc'])
  loaiQuanHe: 'Bo' | 'Me' | 'Con' | 'Vo' | 'Chong' | 'NguoiThan' | 'NguoiChamSoc';
}

export class UpdateOwnPatientDto extends PatientProfileFieldsDto {
  @Transform(trim)
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  hoTen?: string;

  @Transform(trim)
  @ValidateIf((_, value) => value !== undefined)
  @Matches(/^0\d{9,10}$/, { message: 'Số điện thoại bắt đầu bằng 0 và có 10 hoặc 11 chữ số.' })
  soDienThoai?: string;

  @Type(() => Boolean)
  @IsOptional()
  @IsBoolean()
  coBhyt?: boolean;

  @Transform(bhytNumber)
  @ValidateIf((dto: UpdateOwnPatientDto) => dto.coBhyt === true || (dto.coBhyt === undefined && dto.soBhyt != null))
  @IsString({ message: 'Hãy nhập số thẻ BHYT để xác nhận có BHYT.' })
  @Matches(BHYT_NUMBER_PATTERN, { message: BHYT_NUMBER_MESSAGE })
  soBhyt?: string | null;
}

export class UpdateRelativePatientDto extends UpdateOwnPatientDto {
  @Transform(trim)
  @IsOptional()
  @IsIn(['Bo', 'Me', 'Con', 'Vo', 'Chong', 'NguoiThan', 'NguoiChamSoc'])
  loaiQuanHe?: 'Bo' | 'Me' | 'Con' | 'Vo' | 'Chong' | 'NguoiThan' | 'NguoiChamSoc';
}

export class CreatePatientDto {
  @IsUUID()
  idTaiKhoan: string;

  @IsString()
  @MaxLength(150)
  hoTen: string;

  @IsDateString()
  ngaySinh: string;

  @IsIn(['Nam', 'Nu'])
  gioiTinh: 'Nam' | 'Nu';

  @Matches(/^0\d{9,10}$/)
  soDienThoai: string;

  @IsEmail()
  @MaxLength(150)
  email: string;

  @IsString()
  @MaxLength(255)
  diaChi: string;

  @Type(() => Boolean)
  @IsOptional()
  @IsBoolean()
  coBhyt?: boolean;

  @Transform(bhytNumber)
  @ValidateIf((dto: CreatePatientDto) => dto.coBhyt === true)
  @IsString({ message: 'Hãy nhập số thẻ BHYT để xác nhận có BHYT.' })
  @Matches(BHYT_NUMBER_PATTERN, { message: BHYT_NUMBER_MESSAGE })
  soBhyt?: string | null;
}
