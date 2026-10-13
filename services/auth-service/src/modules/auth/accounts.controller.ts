import { Body, Controller, Delete, Get, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AccessTokenPayload, AppRole, CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '@qlpk/common';
import { AccountsService } from './accounts.service';
import { AccountsQueryDto, AccountStatusDto } from './dto/accounts.dto';
import { CreateDoctorByManagerDto, CreatePatientByManagerDto, PatientProfilesQueryDto, ProfilesQueryDto, UpdateDoctorByManagerDto, UpdatePatientByManagerDto } from './dto/manager-profiles.dto';
import { DoctorPhotoService, type DoctorPhotoUpload } from './doctor-photo.service';

@Controller('auth/accounts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AppRole.MANAGER)
export class AccountsController {
  constructor(private readonly accounts: AccountsService, private readonly doctorPhotos: DoctorPhotoService) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload, @Query() query: AccountsQueryDto) {
    return this.accounts.list(user.sub, query);
  }

  @Get('patients')
  listPatients(@CurrentUser() user: AccessTokenPayload, @Query() query: PatientProfilesQueryDto) {
    return this.accounts.listPatients(user.sub, query);
  }

  @Post('patients')
  createPatient(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreatePatientByManagerDto) {
    return this.accounts.createPatient(user.sub, dto);
  }

  @Patch('patients/:id')
  updatePatient(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePatientByManagerDto) {
    return this.accounts.updatePatient(user.sub, id, dto);
  }

  @Delete('patients/:id')
  removePatient(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseIntPipe) id: number) {
    return this.accounts.removeProfile(user.sub, 'benh_nhan', 'id_benh_nhan', id);
  }

  @Get('doctors')
  listDoctors(@CurrentUser() user: AccessTokenPayload, @Query() query: ProfilesQueryDto) {
    return this.accounts.listDoctors(user.sub, query);
  }

  @Post('doctors')
  createDoctor(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateDoctorByManagerDto) {
    return this.accounts.createDoctor(user.sub, dto);
  }

  @Post('doctors/:id/photo')
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async uploadDoctorPhoto(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() photo?: DoctorPhotoUpload,
  ) {
    await this.accounts.requireDoctor(user.sub, id);
    return this.doctorPhotos.save(id, photo);
  }

  @Get('doctors/:id/photo')
  async doctorPhoto(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseIntPipe) id: number): Promise<StreamableFile> {
    await this.accounts.requireDoctor(user.sub, id);
    return this.doctorPhotos.open(id);
  }

  @Patch('doctors/:id')
  updateDoctor(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDoctorByManagerDto) {
    return this.accounts.updateDoctor(user.sub, id, dto);
  }

  @Delete('doctors/:id')
  async removeDoctor(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseIntPipe) id: number) {
    const result = await this.accounts.removeProfile(user.sub, 'bac_si', 'id_bac_si', id);
    await this.doctorPhotos.remove(id);
    return result;
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
