import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Matches,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ScheduleItemDto {
  @IsDateString()
  ngayLamViec: string;

  @IsIn(['SANG', 'CHIEU'])
  ca: 'SANG' | 'CHIEU';
}

export class CreateSchedulesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ScheduleItemDto)
  items: ScheduleItemDto[];
}

export class UpdateScheduleDto extends ScheduleItemDto {}

export class ManageScheduleDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  doctorId: number;

  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  ngayLamViec: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:00)?$/)
  gioBatDau: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:00)?$/)
  gioKetThuc: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  thoiLuongMoiCa: number;

  @IsOptional()
  @IsIn(['PENDING', 'APPROVED', 'REJECTED'])
  statusCode?: 'PENDING' | 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  ghiChu?: string | null;
}

export class RejectScheduleDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  lyDo: string;
}

export class BulkApproveDto {
  @IsDateString()
  week: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  doctorId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  chuyenKhoaId?: number;

  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @IsOptional()
  @IsIn(['SANG', 'CHIEU'])
  shift?: 'SANG' | 'CHIEU';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}

export class WeekQueryDto {
  @IsOptional()
  @IsDateString()
  week?: string;
}

export class ManagerScheduleQueryDto {
  @IsOptional()
  @IsDateString()
  week?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @IsOptional()
  @IsIn(['SANG', 'CHIEU'])
  shift?: 'SANG' | 'CHIEU';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  chuyenKhoaId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  doctorId?: number;

  @IsOptional()
  @IsIn(['PENDING', 'APPROVED', 'REJECTED'])
  status?: 'PENDING' | 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}
