import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { AppException } from './errors';

const FIELD_LABELS: Record<string, string> = {
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
  secondaryDiseaseIds: 'Bệnh phụ',
  followUpDate: 'Ngày tái khám',
  doctorNotes: 'Ghi chú bác sĩ',
  notes: 'Ghi chú tiếp nhận',
  reason: 'Lý do',
  phone: 'Số điện thoại',
  email: 'Email',
  password: 'Mật khẩu',
  username: 'Tên đăng nhập',
  fullName: 'Họ và tên',
  birthDate: 'Ngày sinh',
  gender: 'Giới tính',
  address: 'Địa chỉ',
};

export function translateErrorMessage(message: string): string {
  if (!message || typeof message !== 'string') return 'Yêu cầu không hợp lệ.';
  const trimmed = message.trim();

  // Exact phrases required by user specification & standard HTTP errors
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

  // Vital signs specific rules
  if (/^temperature must not be greater than/i.test(trimmed)) return 'Nhiệt độ không được vượt quá 45°C.';
  if (/^temperature must not be less than/i.test(trimmed)) return 'Nhiệt độ không được nhỏ hơn 30°C.';
  if (/^systolicBloodPressure/i.test(trimmed)) return 'Huyết áp tâm thu không hợp lệ. Vui lòng kiểm tra lại.';
  if (/^diastolicBloodPressure/i.test(trimmed)) return 'Huyết áp tâm trương không hợp lệ. Vui lòng kiểm tra lại.';
  if (/^heartRate/i.test(trimmed)) return 'Nhịp tim không hợp lệ. Vui lòng kiểm tra lại (30 - 250 bpm).';
  if (/^weight/i.test(trimmed)) return 'Cân nặng phải là số dương hợp lệ.';
  if (/^height/i.test(trimmed)) return 'Chiều cao phải là số dương hợp lệ.';
  if (/^initialSymptoms (must|should) not be empty$/i.test(trimmed)) return 'Vui lòng nhập triệu chứng ban đầu.';

  // General pattern matching for class-validator messages
  const maxMatch = trimmed.match(/^(\w+) must not be greater than (\d+(?:\.\d+)?)$/i);
  if (maxMatch) {
    const [, field, max] = maxMatch;
    if (field.toLowerCase() === 'spo2') return `Chỉ số SpO₂ không được vượt quá ${max}%.`;
    if (field.toLowerCase() === 'temperature') return `Nhiệt độ không được vượt quá ${max}°C.`;
    const label = FIELD_LABELS[field] || field;
    return `${label} không được vượt quá ${max}.`;
  }

  const minMatch = trimmed.match(/^(\w+) must not be less than (\d+(?:\.\d+)?)$/i);
  if (minMatch) {
    const [, field, min] = minMatch;
    if (field.toLowerCase() === 'spo2') return `Chỉ số SpO₂ không được nhỏ hơn ${min}%.`;
    if (field.toLowerCase() === 'temperature') return `Nhiệt độ không được nhỏ hơn ${min}°C.`;
    const label = FIELD_LABELS[field] || field;
    return `${label} không được nhỏ hơn ${min}.`;
  }

  const emptyMatch = trimmed.match(/^(\w+) (?:should|must) not be empty$/i);
  if (emptyMatch) {
    const [, field] = emptyMatch;
    const label = FIELD_LABELS[field] || field;
    return `Vui lòng nhập ${label.toLowerCase()}.`;
  }

  const dateMatch = trimmed.match(/^(\w+) must be a valid ISO 8601 date string$/i);
  if (dateMatch) {
    const [, field] = dateMatch;
    const label = FIELD_LABELS[field] || field;
    return `${label} không đúng định dạng ngày tháng hợp lệ.`;
  }

  const intMatch = trimmed.match(/^(\w+) must be an integer number$/i);
  if (intMatch) {
    const [, field] = intMatch;
    const label = FIELD_LABELS[field] || field;
    return `${label} phải là số nguyên.`;
  }

  const numMatch = trimmed.match(/^(\w+) must be a number/i);
  if (numMatch) {
    const [, field] = numMatch;
    const label = FIELD_LABELS[field] || field;
    return `${label} phải là số hợp lệ.`;
  }

  const strMatch = trimmed.match(/^(\w+) must be a string$/i);
  if (strMatch) {
    const [, field] = strMatch;
    const label = FIELD_LABELS[field] || field;
    return `${label} phải là chuỗi văn bản.`;
  }

  return trimmed;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<{ status: (code: number) => { json: (body: unknown) => void } }>();

    if (exception instanceof AppException) {
      const resp = exception.getResponse() as Record<string, unknown>;
      const rawMsg = typeof resp.message === 'string' ? resp.message : '';
      const message = translateErrorMessage(rawMsg || exception.message);
      response.status(exception.getStatus()).json({ ...resp, message });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      let message = 'Yêu cầu không hợp lệ.';
      if (typeof raw === 'string') {
        message = translateErrorMessage(raw);
      } else if (Array.isArray((raw as { message?: unknown }).message)) {
        const list = (raw as { message: string[] }).message.map(translateErrorMessage);
        // Avoid repeated duplicate translations
        message = Array.from(new Set(list)).join(', ');
      } else if ((raw as { message?: unknown }).message) {
        message = translateErrorMessage(String((raw as { message: unknown }).message));
      }
      const code = status === 400 ? 'VALIDATION_ERROR' : status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : 'HTTP_ERROR';
      response.status(status).json({ statusCode: status, code, message });
      return;
    }

    console.error(exception);
    response.status(500).json({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Hệ thống đang gặp sự cố. Vui lòng thử lại sau.',
    });
  }
}
