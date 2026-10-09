import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AccessTokenPayload, AppRole, CurrentUser, InternalGuard, JwtAuthGuard, Roles, RolesGuard } from '@qlpk/common';
import {
  BulkApproveDto,
  CreateSchedulesDto,
  ManagerScheduleQueryDto,
  ManageScheduleDto,
  RejectScheduleDto,
  UpdateScheduleDto,
  WeekQueryDto,
} from './dto/schedule.dto';
import { DoctorScheduleService } from './doctor-schedule.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class DoctorScheduleController {
  constructor(private readonly schedules: DoctorScheduleService) {}

  @Get('doctor-schedules/me')
  @Roles(AppRole.DOCTOR)
  mine(@CurrentUser() user: AccessTokenPayload, @Query() query: WeekQueryDto) {
    return this.schedules.myWeek(user.sub, query.week);
  }

  @Post('doctor-schedules')
  @Roles(AppRole.DOCTOR)
  create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateSchedulesDto) {
    return this.schedules.create(user.sub, dto);
  }

  @Patch('doctor-schedules/:id')
  @Roles(AppRole.DOCTOR)
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateScheduleDto,
  ) {
    return this.schedules.update(user.sub, id, dto);
  }

  @Delete('doctor-schedules/:id')
  @Roles(AppRole.DOCTOR)
  remove(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseIntPipe) id: number) {
    return this.schedules.remove(user.sub, id);
  }

  @Get('manager/dashboard')
  @Roles(AppRole.MANAGER)
  dashboard(@CurrentUser() user: AccessTokenPayload) {
    return this.schedules.dashboard(user.sub);
  }

  @Get('manager/doctor-schedules')
  @Roles(AppRole.MANAGER)
  list(@Query() query: ManagerScheduleQueryDto) {
    return this.schedules.managerList(query);
  }

  @Post('manager/doctor-schedules')
  @Roles(AppRole.MANAGER)
  managerCreate(@Body() dto: ManageScheduleDto) {
    return this.schedules.managerCreate(dto);
  }

  @Patch('manager/doctor-schedules/:id')
  @Roles(AppRole.MANAGER)
  managerUpdate(@Param('id', ParseIntPipe) id: number, @Body() dto: ManageScheduleDto) {
    return this.schedules.managerUpdate(id, dto);
  }

  @Delete('manager/doctor-schedules/:id')
  @Roles(AppRole.MANAGER)
  managerRemove(@Param('id', ParseIntPipe) id: number) {
    return this.schedules.managerRemove(id);
  }

  @Get('manager/doctor-schedules/:doctorId')
  @Roles(AppRole.MANAGER)
  doctor(@Param('doctorId', ParseIntPipe) doctorId: number, @Query() query: WeekQueryDto) {
    return this.schedules.managerDoctor(doctorId, query.week);
  }

  @Patch('manager/doctor-schedules/:id/approve')
  @Roles(AppRole.MANAGER)
  approve(@Param('id', ParseIntPipe) id: number) {
    return this.schedules.approve(id);
  }

  @Patch('manager/doctor-schedules/:id/reject')
  @Roles(AppRole.MANAGER)
  reject(@Param('id', ParseIntPipe) id: number, @Body() dto: RejectScheduleDto) {
    return this.schedules.reject(id, dto);
  }

  @Post('manager/doctor-schedules/bulk-approve')
  @Roles(AppRole.MANAGER)
  bulk(@Body() dto: BulkApproveDto) {
    return this.schedules.bulkApprove(dto);
  }
}

@Controller()
@UseGuards(InternalGuard)
export class InternalScheduleController {
  constructor(private readonly schedules: DoctorScheduleService) {}

  @Get('internal/schedules/approved')
  approved(@Query('doctorId', ParseIntPipe) doctorId: number, @Query('date') date: string) {
    return this.schedules.approvedOnDate(doctorId, date.slice(0, 10));
  }
}
