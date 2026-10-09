import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { AccessTokenPayload, AppRole, CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '@qlpk/common';
import { AccountsService } from './accounts.service';
import { AccountsQueryDto, AccountStatusDto } from './dto/accounts.dto';

@Controller('auth/accounts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AppRole.MANAGER)
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload, @Query() query: AccountsQueryDto) {
    return this.accounts.list(user.sub, query);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AccountStatusDto,
  ) {
    return this.accounts.updateStatus(user.sub, id, dto.trangThai);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.accounts.remove(user.sub, id);
  }
}
