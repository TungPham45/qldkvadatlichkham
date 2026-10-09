import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
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
import { LoginDto, RefreshDto, RegisterDto } from './dto/auth.dto';
import { AuthRepository } from './auth.repository';
import { TaiKhoan } from './tai-khoan.entity';

@Injectable()
export class AuthService {
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

  private async safeFindProfile(accountId: string) {
    try {
      return await internalRequest(`${process.env.PATIENT_SERVICE_URL}/internal/patients/by-account/${accountId}`);
    } catch {
      return null;
    }
  }

  private issueTokens(account: TaiKhoan) {
    const user = this.toPublicUser(account);
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

  private toPublicUser(account: TaiKhoan) {
    return {
      id: account.idTaiKhoan,
      username: account.tenDangNhap,
      vaiTro: account.vaiTro as VaiTroValue,
      role: vaiTroToRole(account.vaiTro),
      trangThai: account.trangThai,
    };
  }
}
