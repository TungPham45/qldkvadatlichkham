import { IsDateString, IsEmail, IsIn, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

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
