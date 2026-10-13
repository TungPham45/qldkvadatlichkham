import { api } from '../../api/client';

export interface PasswordResetRequestResult {
  message: string;
  expiresInSeconds: number;
  resendAfterSeconds: number;
  demoOtp?: string;
}

export const passwordResetApi = {
  async request(phone: string) {
    const { data } = await api.post<PasswordResetRequestResult>('/auth/password-reset/request', { phone });
    return data;
  },

  async verify(phone: string, otp: string) {
    const { data } = await api.post<{ resetToken: string; expiresInSeconds: number }>(
      '/auth/password-reset/verify',
      { phone, otp },
    );
    return data;
  },

  async confirm(resetToken: string, newPassword: string, confirmPassword: string) {
    const { data } = await api.post<{ success: boolean; message: string }>(
      '/auth/password-reset/confirm',
      { resetToken, newPassword, confirmPassword },
    );
    return data;
  },
};
