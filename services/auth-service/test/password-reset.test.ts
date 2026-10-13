import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { JwtService } from '@nestjs/jwt';
import { AppException } from '@qlpk/common';
import bcrypt from 'bcryptjs';
import { AuthRepository } from '../dist/modules/auth/auth.repository.js';
import { AuthService } from '../dist/modules/auth/auth.service.js';
import { TaiKhoan } from '../dist/modules/auth/tai-khoan.entity.js';

const phone = '0918196001';

async function fixture(status = 'Active') {
  let passwordHash = await bcrypt.hash('123456', 4);
  const account = Object.assign(new TaiKhoan(), {
    idTaiKhoan: '00000000-0000-0000-0000-000000001001',
    tenDangNhap: 'bn1',
    matKhauMaHoa: passwordHash,
    vaiTro: 'NguoiDung',
    trangThai: status,
  });
  const repository = {
    async findAccountIdsByPhone(value: string) {
      return value === phone ? [account.idTaiKhoan] : [];
    },
    async findById(id: string) {
      return id === account.idTaiKhoan ? account : null;
    },
    async updatePassword(id: string, value: string) {
      assert.equal(id, account.idTaiKhoan);
      passwordHash = value;
      account.matKhauMaHoa = value;
      return { affected: 1 };
    },
  } as unknown as AuthRepository;
  return {
    service: new AuthService(repository, new JwtService()),
    passwordHash: () => passwordHash,
  };
}

function hasCode(code: string) {
  return (error: unknown) => error instanceof AppException
    && (error.getResponse() as { code: string }).code === code;
}

test('demo reset flow creates OTP, verifies it and changes the password once', async () => {
  process.env.PASSWORD_RESET_DEMO_MODE = 'true';
  process.env.JWT_ACCESS_SECRET = 'password-reset-test-secret';
  const state = await fixture();

  const request = await state.service.requestPasswordReset({ phone });
  assert.match(request.demoOtp || '', /^\d{6}$/);
  const wrongOtp = request.demoOtp === '000000' ? '000001' : '000000';
  await assert.rejects(
    state.service.verifyPasswordResetOtp({ phone, otp: wrongOtp }),
    hasCode('OTP_INVALID'),
  );

  const verified = await state.service.verifyPasswordResetOtp({ phone, otp: request.demoOtp! });
  assert.ok(verified.resetToken.length >= 64);
  const result = await state.service.confirmPasswordReset({
    resetToken: verified.resetToken,
    newPassword: 'matkhau-moi',
    confirmPassword: 'matkhau-moi',
  });
  assert.equal(result.success, true);
  assert.equal(await bcrypt.compare('matkhau-moi', state.passwordHash()), true);

  await assert.rejects(
    state.service.confirmPasswordReset({
      resetToken: verified.resetToken,
      newPassword: 'matkhau-khac',
      confirmPassword: 'matkhau-khac',
    }),
    hasCode('PASSWORD_RESET_TOKEN_INVALID'),
  );
});

test('unknown or disabled accounts do not expose a demo OTP', async () => {
  process.env.PASSWORD_RESET_DEMO_MODE = 'true';
  const unknown = await fixture();
  const unknownResult = await unknown.service.requestPasswordReset({ phone: '0900000000' });
  assert.equal(unknownResult.demoOtp, undefined);

  const disabled = await fixture('Locked');
  const disabledResult = await disabled.service.requestPasswordReset({ phone });
  assert.equal(disabledResult.demoOtp, undefined);
});

test('password confirmation must match before changing the password', async () => {
  process.env.PASSWORD_RESET_DEMO_MODE = 'true';
  const state = await fixture();
  const request = await state.service.requestPasswordReset({ phone });
  const verified = await state.service.verifyPasswordResetOtp({ phone, otp: request.demoOtp! });

  await assert.rejects(
    state.service.confirmPasswordReset({
      resetToken: verified.resetToken,
      newPassword: 'matkhau-moi',
      confirmPassword: 'khong-trung',
    }),
    hasCode('VALIDATION_ERROR'),
  );
  assert.equal(await bcrypt.compare('123456', state.passwordHash()), true);
});

test('new password cannot be the same as the current password', async () => {
  process.env.PASSWORD_RESET_DEMO_MODE = 'true';
  const state = await fixture();
  const request = await state.service.requestPasswordReset({ phone });
  const verified = await state.service.verifyPasswordResetOtp({ phone, otp: request.demoOtp! });

  await assert.rejects(
    state.service.confirmPasswordReset({
      resetToken: verified.resetToken,
      newPassword: '123456',
      confirmPassword: '123456',
    }),
    hasCode('PASSWORD_SAME_AS_OLD'),
  );

  const changed = await state.service.confirmPasswordReset({
    resetToken: verified.resetToken,
    newPassword: 'matkhau-moi',
    confirmPassword: 'matkhau-moi',
  });
  assert.equal(changed.success, true);
  assert.equal(await bcrypt.compare('matkhau-moi', state.passwordHash()), true);
});
