import { Transform } from 'class-transformer';
import { IsDateString, IsEmail, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const nullableTrim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() || null : value;

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
  @Matches(/^0\d{9,10}$/)
  soDienThoai?: string | null;

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

  @Transform(nullableTrim)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  soBaoHiemYTe?: string | null;
}

export class CreateOwnPatientDto extends PatientProfileFieldsDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  hoTen: string;
}

export class UpdateOwnPatientDto extends PatientProfileFieldsDto {
  @Transform(trim)
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  hoTen?: string;
}

export class CreatePatientDto {
  @IsUUID()
  idTaiKhoan: string;

  @IsString()
  @MaxLength(150)
  hoTen: string;

  @IsDateString()
  ngaySinh: string;

  @IsIn(['Nam', 'Nu', 'Khac'])
  gioiTinh: string;

  @Matches(/^0\d{9,10}$/)
  soDienThoai: string;

  @IsEmail()
  @MaxLength(150)
  email: string;

  @IsString()
  @MaxLength(255)
  diaChi: string;
}
