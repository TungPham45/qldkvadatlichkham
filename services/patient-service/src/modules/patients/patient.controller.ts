import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { AccessTokenPayload, AppRole, CurrentUser, InternalGuard, JwtAuthGuard, Roles, RolesGuard } from '@qlpk/common';
import { CreatePatientDto } from './dto/patient.dto';
import { PatientService } from './patient.service';

@Controller()
export class PatientController {
  constructor(private readonly patients: PatientService) {}

  @Get('patients/me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AppRole.PATIENT)
  me(@CurrentUser() user: AccessTokenPayload) {
    return this.patients.byAccount(user.sub);
  }

  @Post('internal/patients')
  @UseGuards(InternalGuard)
  create(@Body() dto: CreatePatientDto) {
    return this.patients.create(dto);
  }

  @Get('internal/patients/by-account/:id')
  @UseGuards(InternalGuard)
  byAccount(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.patients.byAccount(id);
  }
}
