import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateAppointmentDto {
  @Type(() => Number)
  @IsInt()
  bacSiId: number;

  @IsDateString()
  ngayHen: string;

  @Matches(/^\d{2}:\d{2}(:\d{2})?$/)
  gioHen: string;

  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  lyDoKham: string;
}

export class AvailabilityQueryDto {
  @Type(() => Number)
  @IsInt()
  doctorId: number;

  @IsDateString()
  date: string;
}

export class MyAppointmentsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;

  @IsOptional()
  @IsString()
  upcoming?: string;
}
