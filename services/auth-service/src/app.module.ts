import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { resolve } from 'path';
import { HealthController } from './health.controller';
import { AuthModule } from './modules/auth/auth.module';
import { TaiKhoan } from './modules/auth/tai-khoan.entity';

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
      entities: [TaiKhoan],
    }),
    AuthModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
