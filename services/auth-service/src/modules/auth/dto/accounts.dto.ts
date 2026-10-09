import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const accountStatuses = ['Active', 'Inactive', 'Locked'] as const;
export type AccountStatus = (typeof accountStatuses)[number];

export class AccountsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  q?: string;

  @IsOptional()
  @IsIn(['Admin', 'BacSi', 'NguoiDung'])
  vaiTro?: string;

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

export class AccountStatusDto {
  @IsIn(accountStatuses, { message: 'Trạng thái tài khoản không hợp lệ.' })
  trangThai: AccountStatus;
}
