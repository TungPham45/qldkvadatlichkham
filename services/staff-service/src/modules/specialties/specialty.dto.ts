import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class SpecialtyQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  q?: string;

  @IsOptional()
  @IsIn(['Active', 'Inactive'])
  trangThai?: 'Active' | 'Inactive';

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

export class SpecialtyInputDto {
  @IsString()
  @MaxLength(150)
  ten: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  moTa?: string;

  @IsIn(['Active', 'Inactive'])
  trangThai: 'Active' | 'Inactive';
}
