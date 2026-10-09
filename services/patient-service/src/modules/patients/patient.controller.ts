import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { AccessTokenPayload, AppRole, CurrentUser, InternalGuard, JwtAuthGuard, Roles, RolesGuard } from '@qlpk/common';
import { CreateOwnPatientDto, CreatePatientDto, UpdateOwnPatientDto } from './dto/patient.dto';
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

  @Post('patients/me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AppRole.PATIENT)
  createOwn(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateOwnPatientDto) {
    return this.patients.createOwn(user.sub, dto);
  }

  @Patch('patients/me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AppRole.PATIENT)
  updateOwn(@CurrentUser() user: AccessTokenPayload, @Body() dto: UpdateOwnPatientDto) {
    return this.patients.updateOwn(user.sub, dto);
  }

  @Delete('patients/me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AppRole.PATIENT)
  deleteOwn(@CurrentUser() user: AccessTokenPayload) {
    return this.patients.deleteOwn(user.sub);
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
