import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BenhNhan } from './benh-nhan.entity';
import { PatientController } from './patient.controller';
import { PatientRepository } from './patient.repository';
import { PatientService } from './patient.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([BenhNhan]),
    JwtModule.registerAsync({
      useFactory: () => ({ secret: process.env.JWT_ACCESS_SECRET }),
    }),
  ],
  controllers: [PatientController],
  providers: [PatientService, PatientRepository],
})
export class PatientModule {}
