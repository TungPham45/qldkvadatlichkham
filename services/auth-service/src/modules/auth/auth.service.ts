import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import {
  AccessTokenPayload,
  AppException,
  ErrorCode,
  internalRequest,
  isDbConflict,
  vaiTroToRole,
  VaiTroValue,
} from '@qlpk/common';
import * as bcrypt from 'bcryptjs';
import {
  ConfirmPasswordResetDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  RequestPasswordResetDto,
  VerifyPasswordResetOtpDto,
} from './dto/auth.dto';
import { AuthRepository } from './auth.repository';
import { TaiKhoan } from './tai-khoan.entity';

interface PasswordResetOtp {
  accountId: string | null;
  digest: string;
  expiresAt: number;
  resendAt: number;
  attemptsRemaining: number;
}

interface PasswordResetGrant {
  accountId: string;
  expiresAt: number;
}

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_RESEND_DELAY_MS = 30 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const RESET_TOKEN_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly passwordResetOtps = new Map<string, PasswordResetOtp>();
  private readonly passwordResetGrants = new Map<string, PasswordResetGrant>();

  constructor(
    private readonly accounts: AuthRepository,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const birth = dto.ngaySinh.slice(0, 10);
    if (birth > new Date().toISOString().slice(0, 10)) {
      throw new AppException(400, ErrorCode.VALIDATION_ERROR, 'Ngày sinh không hợp lệ.');
    }
    const existing = await this.accounts.findByUsername(dto.username);
    if (existing) {
      throw new AppException(409, ErrorCode.USERNAME_ALREADY_EXISTS, 'Tên đăng nhập đã tồn tại.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    let account: TaiKhoan;
    try {
      account = await this.accounts.createPatientAccount(dto.username, passwordHash);
    } catch (error) {
      if (isDbConflict(error)) {
        throw new AppException(409, ErrorCode.USERNAME_ALREADY_EXISTS, 'Tên đăng nhập đã tồn tại.');
      }
      throw error;
    }

    try {
      await internalRequest(`${process.env.PATIENT_SERVICE_URL}/internal/patients`, {
        method: 'POST',
        body: JSON.stringify({
          idTaiKhoan: account.idTaiKhoan,
          hoTen: dto.hoTen.trim(),
          ngaySinh: birth,
          gioiTinh: dto.gioiTinh,
          soDienThoai: dto.soDienThoai,
          email: dto.email.trim().toLowerCase(),
          diaChi: dto.diaChi.trim(),
          coBhyt: dto.coBhyt === true,
          soBhyt: dto.coBhyt === true ? dto.soBhyt : null,
        }),
      });
    } catch (error) {
      const profile = await this.safeFindProfile(account.idTaiKhoan);
      if (!profile) {
        await this.accounts.deleteById(account.idTaiKhoan).catch(() => undefined);
        if (error instanceof AppException) throw error;
        throw new AppException(
          502,
          ErrorCode.PATIENT_PROFILE_CREATE_FAILED,
          'Không tạo được hồ sơ bệnh nhân. Tài khoản đã được hủy.',
        );
      }
    }

    return this.issueTokens(account);
  }

  async login(dto: LoginDto) {
    const account = await this.accounts.findByUsername(dto.username);
    if (!account) {
      throw new AppException(401, ErrorCode.INVALID_CREDENTIALS, 'Tên đăng nhập hoặc mật khẩu không đúng.');
    }
    const matched = await bcrypt.compare(dto.password, account.matKhauMaHoa);
    if (!matched) {
      throw new AppException(401, ErrorCode.INVALID_CREDENTIALS, 'Tên đăng nhập hoặc mật khẩu không đúng.');
    }
    this.assertActive(account);
    return this.issueTokens(account);
  }

  async refresh(dto: RefreshDto) {
    let payload: AccessTokenPayload;
    try {
      payload = this.jwt.verify<AccessTokenPayload>(dto.refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new AppException(401, ErrorCode.UNAUTHORIZED, 'Refresh token không hợp lệ hoặc đã hết hạn.');
    }
    if (payload.type !== 'refresh') {
      throw new AppException(401, ErrorCode.UNAUTHORIZED, 'Refresh token không hợp lệ.');
    }
    const account = await this.accounts.findById(payload.sub);
    if (!account) {
      throw new AppException(401, ErrorCode.UNAUTHORIZED, 'Tài khoản không còn tồn tại.');
    }
    this.assertActive(account);
    return this.issueTokens(account);
  }

  async requestPasswordReset(dto: RequestPasswordResetDto) {
    this.cleanupPasswordResetState();
    const phone = dto.phone.trim();
    const now = Date.now();
    const current = this.passwordResetOtps.get(phone);
    if (current && current.resendAt > now) {
      const waitSeconds = Math.ceil((current.resendAt - now) / 1000);
      throw new AppException(
        429,
        ErrorCode.OTP_RATE_LIMITED,
        `Vui lòng chờ ${waitSeconds} giây trước khi yêu cầu mã OTP mới.`,
      );
    }

    const accountIds = await this.accounts.findAccountIdsByPhone(phone);
    const account = accountIds.length === 1 ? await this.accounts.findById(accountIds[0]) : null;
    const accountId = account?.trangThai === 'Active' ? account.idTaiKhoan : null;
    const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');

    this.passwordResetOtps.set(phone, {
      accountId,
      digest: this.digestOtp(otp),
      expiresAt: now + OTP_TTL_MS,
      resendAt: now + OTP_RESEND_DELAY_MS,
      attemptsRemaining: OTP_MAX_ATTEMPTS,
    });

    return {
      message: 'Nếu số điện thoại đã được đăng ký, mã OTP đã được tạo.',
      expiresInSeconds: OTP_TTL_MS / 1000,
      resendAfterSeconds: OTP_RESEND_DELAY_MS / 1000,
      ...(process.env.PASSWORD_RESET_DEMO_MODE === 'true' && accountId ? { demoOtp: otp } : {}),
    };
  }

  async verifyPasswordResetOtp(dto: VerifyPasswordResetOtpDto) {
    this.cleanupPasswordResetState();
    const phone = dto.phone.trim();
    const record = this.passwordResetOtps.get(phone);
    if (!record || record.expiresAt <= Date.now()) {
      this.passwordResetOtps.delete(phone);
      throw new AppException(400, ErrorCode.OTP_EXPIRED, 'Mã OTP đã hết hạn. Vui lòng yêu cầu mã mới.');
    }

    const expected = Buffer.from(record.digest, 'hex');
    const received = Buffer.from(this.digestOtp(dto.otp), 'hex');
    const matches = timingSafeEqual(expected, received);
    if (!matches || !record.accountId) {
      record.attemptsRemaining -= 1;
      if (record.attemptsRemaining <= 0) this.passwordResetOtps.delete(phone);
      throw new AppException(
        400,
        ErrorCode.OTP_INVALID,
        record.attemptsRemaining > 0
          ? `Mã OTP không đúng. Bạn còn ${record.attemptsRemaining} lần thử.`
          : 'Mã OTP đã bị vô hiệu hóa do nhập sai quá nhiều lần.',
      );
    }

    const account = await this.accounts.findById(record.accountId);
    if (!account || account.trangThai !== 'Active') {
      this.passwordResetOtps.delete(phone);
      throw new AppException(400, ErrorCode.OTP_INVALID, 'Không thể xác minh yêu cầu đặt lại mật khẩu.');
    }

    this.passwordResetOtps.delete(phone);
    const resetToken = randomBytes(32).toString('hex');
    this.passwordResetGrants.set(this.digestResetToken(resetToken), {
      accountId: account.idTaiKhoan,
      expiresAt: Date.now() + RESET_TOKEN_TTL_MS,
    });
    return { resetToken, expiresInSeconds: RESET_TOKEN_TTL_MS / 1000 };
  }

  async confirmPasswordReset(dto: ConfirmPasswordResetDto) {
    this.cleanupPasswordResetState();
    if (dto.newPassword !== dto.confirmPassword) {
      throw new AppException(400, ErrorCode.VALIDATION_ERROR, 'Mật khẩu xác nhận không khớp.');
    }

    const tokenDigest = this.digestResetToken(dto.resetToken);
    const grant = this.passwordResetGrants.get(tokenDigest);
    if (!grant || grant.expiresAt <= Date.now()) {
      this.passwordResetGrants.delete(tokenDigest);
      throw new AppException(
        400,
        ErrorCode.PASSWORD_RESET_TOKEN_INVALID,
        'Phiên đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.',
      );
    }

    const account = await this.accounts.findById(grant.accountId);
    if (!account || account.trangThai !== 'Active') {
      this.passwordResetGrants.delete(tokenDigest);
      throw new AppException(400, ErrorCode.PASSWORD_RESET_TOKEN_INVALID, 'Không thể đặt lại mật khẩu cho tài khoản này.');
    }

    if (await bcrypt.compare(dto.newPassword, account.matKhauMaHoa)) {
      throw new AppException(
        400,
        ErrorCode.PASSWORD_SAME_AS_OLD,
        'Mật khẩu mới bị trùng với mật khẩu cũ. Vui lòng chọn mật khẩu khác.',
      );
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.accounts.updatePassword(account.idTaiKhoan, passwordHash);
    for (const [digest, item] of this.passwordResetGrants) {
      if (item.accountId === account.idTaiKhoan) this.passwordResetGrants.delete(digest);
    }
    return { success: true, message: 'Đổi mật khẩu thành công. Bạn có thể đăng nhập bằng mật khẩu mới.' };
  }

  logout() {
    return { success: true };
  }

  async me(userId: string) {
    const account = await this.accounts.findById(userId);
    if (!account) {
      throw new AppException(401, ErrorCode.UNAUTHORIZED, 'Tài khoản không còn tồn tại.');
    }
    this.assertActive(account);
    return this.toPublicUser(account);
  }

  private assertActive(account: TaiKhoan) {
    if (account.trangThai !== 'Active') {
      throw new AppException(403, ErrorCode.ACCOUNT_DISABLED, 'Tài khoản đang bị khóa hoặc ngừng hoạt động.');
    }
  }

  private digestOtp(otp: string) {
    const secret = process.env.JWT_ACCESS_SECRET || 'password-reset-demo-secret';
    return createHmac('sha256', secret).update(otp).digest('hex');
  }

  private digestResetToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private cleanupPasswordResetState() {
    const now = Date.now();
    for (const [phone, record] of this.passwordResetOtps) {
      if (record.expiresAt <= now) this.passwordResetOtps.delete(phone);
    }
    for (const [digest, grant] of this.passwordResetGrants) {
      if (grant.expiresAt <= now) this.passwordResetGrants.delete(digest);
    }
  }

  private async safeFindProfile(accountId: string) {
    try {
      return await internalRequest(`${process.env.PATIENT_SERVICE_URL}/internal/patients/by-account/${accountId}`);
    } catch {
      return null;
    }
  }

  private async issueTokens(account: TaiKhoan) {
    const user = await this.toPublicUser(account);
    const accessPayload: AccessTokenPayload = { ...user, sub: account.idTaiKhoan, type: 'access' };
    const refreshPayload: AccessTokenPayload = { ...user, sub: account.idTaiKhoan, type: 'refresh' };
    const accessToken = this.jwt.sign(accessPayload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: Number(process.env.JWT_ACCESS_TTL || 900),
    });
    const refreshToken = this.jwt.sign(refreshPayload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: Number(process.env.JWT_REFRESH_TTL || 604800),
    });
    return { accessToken, refreshToken, user };
  }

  private async toPublicUser(account: TaiKhoan) {
    return {
      id: account.idTaiKhoan,
      username: account.tenDangNhap,
      vaiTro: account.vaiTro as VaiTroValue,
      role: vaiTroToRole(account.vaiTro),
      trangThai: account.trangThai,
      canManagePayments: await this.accounts.hasPaymentPermission(account.idTaiKhoan),
    };
  }
}
