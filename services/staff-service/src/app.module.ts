import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { resolve } from 'path';
import { STAFF_ENTITIES } from './database/entities';
import { DoctorController } from './modules/doctors/doctor.controller';
import { DoctorScheduleController, InternalScheduleController } from './modules/doctor-schedules/doctor-schedule.controller';
import { DoctorScheduleRepository } from './modules/doctor-schedules/doctor-schedule.repository';
import { DoctorScheduleService } from './modules/doctor-schedules/doctor-schedule.service';
import { SpecialtyController } from './modules/specialties/specialty.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: resolve(__dirname, '../../../.env') }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5433),
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'qlphongkham',
      synchronize: false,
      entities: STAFF_ENTITIES,
    }),
    TypeOrmModule.forFeature(STAFF_ENTITIES),
    JwtModule.registerAsync({ useFactory: () => ({ secret: process.env.JWT_ACCESS_SECRET }) }),
  ],
  controllers: [DoctorScheduleController, InternalScheduleController, SpecialtyController, DoctorController],
  providers: [DoctorScheduleService, DoctorScheduleRepository],
})
export class AppModule {}
