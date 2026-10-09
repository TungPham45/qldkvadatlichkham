import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { resolve } from 'path';
import { AppointmentController, InternalAppointmentController } from './modules/appointments/appointment.controller';
import { AppointmentRepository } from './modules/appointments/appointment.repository';
import { AppointmentService } from './modules/appointments/appointment.service';
import { LichHen } from './modules/appointments/lich-hen.entity';
import { RedisModule } from './redis/redis.module';

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
      entities: [LichHen],
    }),
    TypeOrmModule.forFeature([LichHen]),
    JwtModule.registerAsync({ useFactory: () => ({ secret: process.env.JWT_ACCESS_SECRET }) }),
    RedisModule,
  ],
  controllers: [AppointmentController, InternalAppointmentController],
  providers: [AppointmentService, AppointmentRepository],
})
export class AppModule {}
