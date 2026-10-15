import type { ReceptionInput } from '../features/clinical/api';

export interface ReceptionValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
  firstErrorField: string | null;
  summaryError: string;
}

export function validateReception(form: ReceptionInput, isCheckIn = true): ReceptionValidationResult {
  const errors: Record<string, string> = {};
  let firstErrorField: string | null = null;

  function addError(field: string, message: string) {
    if (!errors[field]) {
      errors[field] = message;
      if (!firstErrorField) firstErrorField = field;
    }
  }

  function isBlank(value: unknown): boolean {
    return value === undefined || value === null || String(value).trim() === '';
  }

  // 1. Nhiệt độ
  if (isCheckIn && isBlank(form.temperature)) {
    addError('temperature', 'Vui lòng nhập nhiệt độ.');
  } else if (!isBlank(form.temperature)) {
    const temp = Number(form.temperature);
    if (Number.isNaN(temp) || temp < 30 || temp > 45) {
      addError('temperature', 'Nhiệt độ phải từ 30°C đến 45°C.');
    }
  }

  // 2. Huyết áp tâm thu
  if (isCheckIn && isBlank(form.systolicBloodPressure)) {
    addError('systolicBloodPressure', 'Vui lòng nhập huyết áp tâm thu.');
  } else if (!isBlank(form.systolicBloodPressure)) {
    const sys = Number(form.systolicBloodPressure);
    if (Number.isNaN(sys) || !Number.isInteger(sys) || sys < 50 || sys > 260) {
      addError('systolicBloodPressure', 'Huyết áp tâm thu không hợp lệ. Vui lòng kiểm tra lại.');
    }
  }

  // 3. Huyết áp tâm trương
  if (isCheckIn && isBlank(form.diastolicBloodPressure)) {
    addError('diastolicBloodPressure', 'Vui lòng nhập huyết áp tâm trương.');
  } else if (!isBlank(form.diastolicBloodPressure)) {
    const dia = Number(form.diastolicBloodPressure);
    if (Number.isNaN(dia) || !Number.isInteger(dia) || dia < 30 || dia > 160) {
      addError('diastolicBloodPressure', 'Huyết áp tâm trương không hợp lệ. Vui lòng kiểm tra lại.');
    }
  }

  // Quan hệ giữa tâm thu và tâm trương
  if (!errors.systolicBloodPressure && !errors.diastolicBloodPressure) {
    if (!isBlank(form.systolicBloodPressure) && !isBlank(form.diastolicBloodPressure)) {
      const sys = Number(form.systolicBloodPressure);
      const dia = Number(form.diastolicBloodPressure);
      if (!Number.isNaN(sys) && !Number.isNaN(dia) && sys <= dia) {
        addError('systolicBloodPressure', 'Huyết áp tâm thu phải lớn hơn huyết áp tâm trương.');
      }
    }
  }

  // 4. Nhịp tim
  if (isCheckIn && isBlank(form.heartRate)) {
    addError('heartRate', 'Vui lòng nhập nhịp tim.');
  } else if (!isBlank(form.heartRate)) {
    const hr = Number(form.heartRate);
    if (Number.isNaN(hr) || !Number.isInteger(hr) || hr < 30 || hr > 250) {
      addError('heartRate', 'Nhịp tim không hợp lệ. Vui lòng kiểm tra lại (30 - 250 bpm).');
    }
  }

  // 5. SpO2
  if (isCheckIn && isBlank(form.spo2)) {
    addError('spo2', 'Vui lòng nhập chỉ số SpO₂.');
  } else if (!isBlank(form.spo2)) {
    const spo2Val = Number(form.spo2);
    if (Number.isNaN(spo2Val)) {
      addError('spo2', 'Chỉ số SpO₂ phải là số hợp lệ.');
    } else if (spo2Val > 100) {
      addError('spo2', 'Chỉ số SpO₂ không được vượt quá 100%.');
    } else if (spo2Val < 0) {
      addError('spo2', 'Chỉ số SpO₂ không được nhỏ hơn 0%.');
    }
  }

  // 6. Cân nặng
  if (isCheckIn && isBlank(form.weight)) {
    addError('weight', 'Vui lòng nhập cân nặng.');
  } else if (!isBlank(form.weight)) {
    const w = Number(form.weight);
    if (Number.isNaN(w) || w <= 0 || w > 500) {
      addError('weight', 'Cân nặng phải là số dương hợp lệ.');
    }
  }

  // 7. Chiều cao
  if (isCheckIn && isBlank(form.height)) {
    addError('height', 'Vui lòng nhập chiều cao.');
  } else if (!isBlank(form.height)) {
    const h = Number(form.height);
    if (Number.isNaN(h) || h <= 0 || h > 300) {
      addError('height', 'Chiều cao phải là số dương hợp lệ.');
    }
  }

  // 8. Triệu chứng ban đầu
  if (isCheckIn && (!form.initialSymptoms || !form.initialSymptoms.trim())) {
    addError('initialSymptoms', 'Vui lòng nhập triệu chứng ban đầu.');
  } else if (form.initialSymptoms && form.initialSymptoms.length > 2000) {
    addError('initialSymptoms', 'Triệu chứng ban đầu tối đa 2000 ký tự.');
  }

  // 9. Ghi chú tiếp nhận (Tùy chọn)
  if (form.notes && form.notes.length > 2000) {
    addError('notes', 'Ghi chú tiếp nhận tối đa 2000 ký tự.');
  }

  const keys = Object.keys(errors);
  const isValid = keys.length === 0;
  const summaryError = isValid
    ? ''
    : 'Vui lòng nhập đầy đủ và chính xác các thông tin bắt buộc.';

  return { isValid, errors, firstErrorField, summaryError };
}
