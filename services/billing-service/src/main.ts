import './load-env';
import 'reflect-metadata';
import {
  Body,
  Controller,
  Get,
  Inject,
  Module,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AccessTokenPayload,
  AllExceptionsFilter,
  AppRole,
  CurrentUser,
  JwtAuthGuard,
  PaymentMethod,
  Roles,
  RolesGuard,
} from '@qlpk/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { BillingService, InvoicePayload, PaymentPayload } from './billing.service';

class InvoiceDto implements InvoicePayload {
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) examFee?: number;
}

class InvoicesQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
}

class PatientCheckoutDto {
  @IsOptional() @IsString() method?: string;
  @IsOptional() @IsString() idempotencyKey?: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

class PaymentDto implements PaymentPayload {
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount!: number;
  @IsString() @IsIn(Object.values(PaymentMethod)) method!: (typeof PaymentMethod)[keyof typeof PaymentMethod];
  @IsString() @MaxLength(100) idempotencyKey!: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

@Controller()
class HealthController {
  @Get('health')
  health() {
    return { status: 'ok', service: 'billing-service' };
  }
}

@Controller('billing')
@UseGuards(JwtAuthGuard, RolesGuard)
class BillingController {
  constructor(@Inject(BillingService) private readonly billing: BillingService) {}

  @Get('my-invoices')
  @Roles(AppRole.PATIENT, AppRole.MANAGER)
  myInvoices(
    @CurrentUser() user: AccessTokenPayload,
    @Query() q: InvoicesQueryDto,
  ) {
    return this.billing.myInvoices(user, q);
  }

  @Get('appointments/:appointmentId/invoice')
  @Roles(AppRole.PATIENT, AppRole.DOCTOR, AppRole.MANAGER)
  invoice(
    @CurrentUser() user: AccessTokenPayload,
    @Param('appointmentId', ParseIntPipe) appointmentId: number,
  ) {
    return this.billing.invoice(user, appointmentId);
  }

  @Post('appointments/:appointmentId/patient-checkout')
  @Roles(AppRole.PATIENT)
  patientCheckout(
    @CurrentUser() user: AccessTokenPayload,
    @Param('appointmentId', ParseIntPipe) appointmentId: number,
    @Body() dto: PatientCheckoutDto,
  ) {
    return this.billing.patientCheckout(user, appointmentId, dto);
  }

  @Post('appointments/:appointmentId/invoice')
  @Roles(AppRole.MANAGER)
  createInvoice(
    @CurrentUser() user: AccessTokenPayload,
    @Param('appointmentId', ParseIntPipe) appointmentId: number,
    @Body() dto: InvoiceDto,
  ) {
    return this.billing.createInvoice(user, appointmentId, dto);
  }

  @Post('appointments/:appointmentId/payments')
  @Roles(AppRole.MANAGER)
  recordPayment(
    @CurrentUser() user: AccessTokenPayload,
    @Param('appointmentId', ParseIntPipe) appointmentId: number,
    @Body() dto: PaymentDto,
  ) {
    return this.billing.recordPayment(user, appointmentId, dto);
  }
}

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5433),
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'qlphongkham',
      synchronize: false,
    }),
    JwtModule.register({ secret: process.env.JWT_ACCESS_SECRET }),
  ],
  controllers: [HealthController, BillingController],
  providers: [BillingService],
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.listen(Number(process.env.BILLING_PORT || 3012));
}

if (require.main === module) void bootstrap();
