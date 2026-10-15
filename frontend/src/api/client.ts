import axios from 'axios';
import { tokenStore } from './token';

export const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = tokenStore.getAccess();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing: Promise<string | null> | null = null;

async function refreshAccess() {
  const refreshToken = tokenStore.getRefresh();
  if (!refreshToken) return null;
  const { data } = await axios.post('/api/auth/refresh', { refreshToken });
  tokenStore.set(data.accessToken, data.refreshToken);
  return data.accessToken as string;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 403 && error.response?.data?.code === 'ACCOUNT_DISABLED') {
      tokenStore.clear();
      if (!window.location.pathname.startsWith('/login')) window.location.href = '/login';
      return Promise.reject(error);
    }
    const original = error.config;
    const url = String(original?.url || '');
    if (error.response?.status === 401 && original && !original._retry && !url.includes('/auth/login') && !url.includes('/auth/refresh') && !url.includes('/auth/register')) {
      original._retry = true;
      try {
        refreshing ??= refreshAccess().finally(() => {
          refreshing = null;
        });
        const accessToken = await refreshing;
        if (!accessToken) throw error;
        original.headers.Authorization = `Bearer ${accessToken}`;
        return api(original);
      } catch {
        tokenStore.clear();
        if (!window.location.pathname.startsWith('/login')) window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

const FRONTEND_FIELD_LABELS: Record<string, string> = {
  spo2: 'Chỉ số SpO₂',
  temperature: 'Nhiệt độ',
  systolicBloodPressure: 'Huyết áp tâm thu',
  diastolicBloodPressure: 'Huyết áp tâm trương',
  heartRate: 'Nhịp tim',
  weight: 'Cân nặng',
  height: 'Chiều cao',
  initialSymptoms: 'Triệu chứng ban đầu',
  symptoms: 'Triệu chứng',
  examResult: 'Kết quả khám',
  conclusion: 'Kết luận khám',
  treatment: 'Hướng điều trị',
  diseaseId: 'Bệnh chẩn đoán',
  followUpDate: 'Ngày tái khám',
};

function translateRawMessage(msg: string): string {
  if (!msg || typeof msg !== 'string') return '';
  const trimmed = msg.trim();
  if (/^spo2 must not be greater than 100$/i.test(trimmed)) return 'Chỉ số SpO₂ không được vượt quá 100%.';
  if (/^spo2 must not be less than 0$/i.test(trimmed)) return 'Chỉ số SpO₂ không được nhỏ hơn 0%.';
  if (/^examResult (must|should) not be empty$/i.test(trimmed)) return 'Vui lòng nhập kết quả khám.';
  if (/^conclusion (must|should) not be empty$/i.test(trimmed)) return 'Vui lòng nhập kết luận khám.';
  if (/^treatment (must|should) not be empty$/i.test(trimmed)) return 'Vui lòng nhập hướng điều trị.';
  if (/^diseaseId must not be less than 1$/i.test(trimmed)) return 'Vui lòng chọn bệnh chẩn đoán hợp lệ.';
  if (/^followUpDate must be a valid ISO 8601 date string$/i.test(trimmed)) return 'Ngày tái khám không hợp lệ.';
  if (/^followUpDate must be a Date instance$/i.test(trimmed)) return 'Ngày tái khám không hợp lệ.';
  if (/^unauthorized$/i.test(trimmed)) return 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.';
  if (/^forbidden$/i.test(trimmed)) return 'Bạn không có quyền thực hiện thao tác này.';
  if (/^internal server error$/i.test(trimmed)) return 'Hệ thống đang gặp sự cố. Vui lòng thử lại sau.';
  if (/^bad request( exception)?$/i.test(trimmed)) return 'Yêu cầu không hợp lệ.';
  if (/^not found$/i.test(trimmed)) return 'Không tìm thấy tài nguyên yêu cầu.';
  if (/^temperature must not be greater than/i.test(trimmed)) return 'Nhiệt độ không được vượt quá 45°C.';
  if (/^temperature must not be less than/i.test(trimmed)) return 'Nhiệt độ không được nhỏ hơn 30°C.';
  if (/^systolicBloodPressure/i.test(trimmed)) return 'Huyết áp tâm thu không hợp lệ. Vui lòng kiểm tra lại.';
  if (/^diastolicBloodPressure/i.test(trimmed)) return 'Huyết áp tâm trương không hợp lệ. Vui lòng kiểm tra lại.';
  if (/^heartRate/i.test(trimmed)) return 'Nhịp tim không hợp lệ. Vui lòng kiểm tra lại (30 - 250 bpm).';
  if (/^weight/i.test(trimmed)) return 'Cân nặng phải là số dương hợp lệ.';
  if (/^height/i.test(trimmed)) return 'Chiều cao phải là số dương hợp lệ.';
  if (/^initialSymptoms (must|should) not be empty$/i.test(trimmed)) return 'Vui lòng nhập triệu chứng ban đầu.';

  const maxMatch = trimmed.match(/^(\w+) must not be greater than (\d+(?:\.\d+)?)$/i);
  if (maxMatch) {
    const [, field, max] = maxMatch;
    if (field.toLowerCase() === 'spo2') return `Chỉ số SpO₂ không được vượt quá ${max}%.`;
    if (field.toLowerCase() === 'temperature') return `Nhiệt độ không được vượt quá ${max}°C.`;
    const label = FRONTEND_FIELD_LABELS[field] || field;
    return `${label} không được vượt quá ${max}.`;
  }

  const minMatch = trimmed.match(/^(\w+) must not be less than (\d+(?:\.\d+)?)$/i);
  if (minMatch) {
    const [, field, min] = minMatch;
    if (field.toLowerCase() === 'spo2') return `Chỉ số SpO₂ không được nhỏ hơn ${min}%.`;
    if (field.toLowerCase() === 'temperature') return `Nhiệt độ không được nhỏ hơn ${min}°C.`;
    const label = FRONTEND_FIELD_LABELS[field] || field;
    return `${label} không được nhỏ hơn ${min}.`;
  }

  return trimmed;
}

export function errorMessage(error: unknown, fallback = 'Không thực hiện được yêu cầu.') {
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra các dịch vụ và thử lại.';
    if (error.response.status === 401) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
    if (error.response.status === 403) return 'Bạn không có quyền thực hiện thao tác này.';
    if ([502, 503, 504].includes(error.response.status)) return 'Dịch vụ nghiệp vụ đang tạm thời không phản hồi. Vui lòng thử lại.';
    if (error.response.status >= 500) return 'Máy chủ gặp lỗi khi xử lý dữ liệu. Vui lòng thử lại hoặc liên hệ quản trị viên.';
    const rawMsg = error.response?.data?.message;
    if (Array.isArray(rawMsg)) {
      return rawMsg.map((m) => translateRawMessage(String(m))).filter(Boolean).join(', ') || fallback;
    }
    if (typeof rawMsg === 'string') {
      return translateRawMessage(rawMsg) || fallback;
    }
    return fallback;
  }
  return fallback;
}

export function hasApiErrorCode(error: unknown, code: string) {
  return axios.isAxiosError(error) && error.response?.data?.code === code;
}
