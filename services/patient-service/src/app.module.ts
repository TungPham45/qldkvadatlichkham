import { Controller, Get, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { resolve } from 'path';
import { BenhNhan } from './modules/patients/benh-nhan.entity';
import { PatientModule } from './modules/patients/patient.module';
import { SchemaUpgradeService } from './schema-upgrade.service';

@Controller()
class HealthController {
  @Get('health')
  health() {
    return { status: 'ok', service: 'patient-service' };
  }
}

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
      entities: [BenhNhan],
    }),
    PatientModule,
  ],
  controllers: [HealthController],
  providers: [SchemaUpgradeService],
})
export class AppModule {}
