import { api } from '../../api/client';

export interface PageResult<T> { items: T[]; total: number; page: number; limit: number }
export interface Disease { id:number; code:string; name:string; description:string|null; group:string|null; createdAt:string; updatedAt:string }
export interface DiseaseInput { code:string; name:string; description:string; group:string }
export interface MedicalRecord {
  id:number; appointmentId:number; examDate:string; symptoms:string|null; examResult:string|null; conclusion:string|null; treatment:string|null; doctorNotes:string|null; followUpDate:string|null;
  patient:{id:number;code:string;name:string;phone:string|null;birthDate:string|null}; doctor:{id:number;code:string;name:string};
  diagnoses:Array<{id:number;code:string;name:string;primary:boolean;note:string|null}>;
  prescription:null|{id:number;date:string;status:string;note:string|null;items:Array<{drug:string;strength:string|null;quantity:number;dosage:string|null;frequency:string|null;days:number|null;route:string|null;instructions:string|null}>};
  invoice:null|{id:string;date:string;examFee:string;medicineAmount:string;total:string;status:string;payments:Array<{amount:string;method:string;status:string;paidAt:string}>};
}
export interface ReceptionItem { appointmentId:number;date:string;time:string;status:string;checkedInAt:string|null;patient:{id:number;code:string;name:string;phone:string};doctor:{id:number;name:string};reception:null|ReceptionInput&{id:number;recordedAt:string} }
export interface ReceptionInput { appointmentId:number;weight?:number;height?:number;temperature?:number;systolicBloodPressure?:number;diastolicBloodPressure?:number;heartRate?:number;spo2?:number;initialSymptoms?:string;notes?:string }
export interface AppNotification { id:number;appointmentId:number|null;type:string;channel:string;title:string;content:string;status:string;readAt:string|null;createdAt:string }

export const clinicalApi={
  history:(params:Record<string,unknown>)=>api.get<PageResult<MedicalRecord>>('/medical-records/history',{params}).then(r=>r.data),
  diseases:(params:Record<string,unknown>)=>api.get<PageResult<Disease>&{groups:string[]}>('/diseases',{params}).then(r=>r.data),
  disease:(id:number)=>api.get<Disease>(`/diseases/${id}`).then(r=>r.data),
  createDisease:(body:DiseaseInput)=>api.post<Disease>('/diseases',body).then(r=>r.data),
  updateDisease:(id:number,body:DiseaseInput)=>api.put<Disease>(`/diseases/${id}`,body).then(r=>r.data),
  receptions:(params:Record<string,unknown>)=>api.get<PageResult<ReceptionItem>>('/reception',{params}).then(r=>r.data),
  createReception:(body:ReceptionInput)=>api.post('/reception',body).then(r=>r.data),
  updateReception:(id:number,body:ReceptionInput)=>api.put(`/reception/${id}`,body).then(r=>r.data),
};

export const notificationApi={
  list:(params:Record<string,unknown>)=>api.get<PageResult<AppNotification>>('/notifications',{params}).then(r=>r.data),
  count:()=>api.get<{count:number}>('/notifications/unread-count').then(r=>r.data.count),
  read:(id:number)=>api.patch<AppNotification>(`/notifications/${id}/read`).then(r=>r.data),
  readAll:()=>api.patch('/notifications/read-all').then(r=>r.data),
};
