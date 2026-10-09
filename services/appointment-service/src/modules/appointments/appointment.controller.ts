import { Body, Controller, Delete, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AccessTokenPayload, AppRole, CurrentUser, InternalGuard, JwtAuthGuard, Roles, RolesGuard } from '@qlpk/common';
import { AppointmentService } from './appointment.service';
import { AvailabilityQueryDto, CreateAppointmentDto, MyAppointmentsQueryDto } from './dto/appointment.dto';

@Controller('appointments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AppointmentController {
  constructor(private readonly appointments: AppointmentService) {}

  @Get('availability')
  @Roles(AppRole.PATIENT)
  availability(@Query() query: AvailabilityQueryDto) {
    return this.appointments.availability(query.doctorId, query.date);
  }

  @Post()
  @Roles(AppRole.PATIENT)
  create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateAppointmentDto) {
    return this.appointments.book(user.sub, dto);
  }

  @Get('me')
  @Roles(AppRole.PATIENT)
  mine(@CurrentUser() user: AccessTokenPayload, @Query() query: MyAppointmentsQueryDto) {
    return this.appointments.mine(user.sub, query.page ?? 1, query.pageSize ?? 10, query.upcoming === 'true');
  }
}

@Controller('internal/appointments')
@UseGuards(InternalGuard)
export class InternalAppointmentController {
  constructor(private readonly appointments: AppointmentService) {}

  @Get('stats')
  stats() {
    return this.appointments.stats();
  }

  @Delete('cache')
  clear(@Query('doctorId') doctorId: string, @Query('date') date: string) {
    return this.appointments.invalidate(Number(doctorId), date);
  }
}
