import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { TaiKhoan } from './tai-khoan.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([TaiKhoan]),
    JwtModule.registerAsync({
      useFactory: () => ({ secret: process.env.JWT_ACCESS_SECRET }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthRepository],
})
export class AuthModule {}
