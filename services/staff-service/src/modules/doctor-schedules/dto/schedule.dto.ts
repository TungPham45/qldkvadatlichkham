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
  q?: string;
}
