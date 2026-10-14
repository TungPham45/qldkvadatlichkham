import { api } from '../../api/client';

export interface PageResult<T> { items: T[]; total: number; page: number; limit: number }
export interface ReceptionStats { total:number;awaitingReception:number;waiting:number;inProgress:number;examCompleted:number;unpaid:number;completed:number }
export interface ReceptionTabs { pending:number;confirmed:number;cancelled:number;waiting:number;inProgress:number;completed:number }
export interface Disease { id:number; code:string; name:string; description:string|null; group:string|null; createdAt:string; updatedAt:string }
export interface DiseaseInput { code:string; name:string; description:string; group:string }
export interface MedicalRecord {
  id:number; appointmentId:number; examDate:string; symptoms:string|null; examResult:string|null; conclusion:string|null; treatment:string|null; doctorNotes:string|null; followUpDate:string|null;
  patient:{id:number;code:string;name:string;phone:string|null;birthDate:string|null}; doctor:{id:number;code:string;name:string};
  diagnoses:Array<{id:number;code:string;name:string;primary:boolean;note:string|null}>;
  prescription:null|{id:number;date:string;status:string;note:string|null;items:Array<{drug:string;strength:string|null;quantity:number;dosage:string|null;frequency:string|null;days:number|null;route:string|null;instructions:string|null}>};
  invoice:null|{id:string;date:string;examFee:string;medicineAmount:string;total:string;status:string;payments:Array<{amount:string;method:string;status:string;paidAt:string}>};
}
export interface ReceptionItem {
  appointmentId:number;
  code:string;
  date:string;
  time:string;
  reason:string|null;
  cancellationReason:string|null;
  status:string;
  visitType:'Kham lan dau'|'Tai kham';
  bookedAt:string;
  checkedInAt:string|null;
  examStartedAt:string|null;
  examCompletedAt:string|null;
  visitCompletedAt:string|null;
  patient:{id:number;code:string;name:string;phone:string|null;birthDate:string|null;gender:string|null;address:string|null;hasInsurance:boolean;insuranceNumber:string|null};
  doctor:{id:number;code:string|null;name:string;specialty:{id:number;name:string|null}|null};
  reception:null|ReceptionInput&{id:number;recordedAt:string;recordedBy:string|null};
  medicalRecord:null|MedicalRecordInput&{id:number;diseaseCode:string|null;diseaseName:string|null;diagnoses:Array<{id:number;code:string;name:string;primary:boolean;note:string|null}>};
  invoice:null|InvoiceSummary;
}
export interface ReceptionInput { appointmentId:number;weight?:number;height?:number;temperature?:number;systolicBloodPressure?:number;diastolicBloodPressure?:number;heartRate?:number;spo2?:number;initialSymptoms?:string;notes?:string }
export interface PrescriptionItemInput { medicineId:number;medicineName?:string;strength?:string|null;quantity:number;dosage?:string;frequency?:string;days?:number;route?:string;instructions?:string }
export interface MedicalRecordInput { symptoms?:string;onset?:string;diseaseProgress?:string;postTreatmentProgress?:string;examResult?:string;conclusion?:string;treatment?:string;doctorNotes?:string;followUpDate?:string;careAdvice?:string;diseaseId?:number;secondaryDiseaseIds?:number[];diagnosisNote?:string;noClinicalServices?:boolean;noPrescription?:boolean;prescriptionLocked?:boolean;prescriptionNote?:string;prescriptionItems?:PrescriptionItemInput[];prescription?:null|{id:number;note:string|null;status:string;items:PrescriptionItemInput[]} }
export interface InvoiceSummary { id:string;date:string;createdAt:string;examFee:string;serviceAmount:string;medicineAmount:string;discount:string;total:string;paidAmount:string;balance:string;status:string;lastPaidAt:string|null }
export interface InvoiceItemBreakdown {
  code?: string;
  name: string;
  group?: string | null;
  strength?: string | null;
  unit?: string | null;
  performingUnit?: string | null;
  quantity: number;
  unitPrice: string | number;
  amount: string | number;
}

export interface InvoiceDetail extends InvoiceSummary {
  appointmentId: number;
  appointmentCode: string;
  patientId: number;
  patientCode: string;
  patientName: string;
  doctorName?: string;
  specialtyName?: string;
  appointmentDate?: string;
  appointmentTime?: string;
  services?: InvoiceItemBreakdown[];
  medicines?: InvoiceItemBreakdown[];
  payments: Array<{
    id: number;
    amount: string;
    method: string;
    reference: string;
    status: string;
    paidAt: string;
    confirmedBy: string | null;
    note: string | null;
  }>;
}
export interface AppNotification { id:number;appointmentId:number|null;type:string;channel:string;title:string;content:string;status:string;link:string|null;readAt:string|null;createdAt:string }
export interface ClinicalServiceCatalogItem {
  id: number;
  code: string;
  name: string;
  group: string | null;
  performingUnit: string | null;
  unitPrice: string | number;
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
}
export interface ClinicalServiceCatalogInput {
  code: string;
  name: string;
  group?: string;
  performingUnit?: string;
  unitPrice: number;
  active?: boolean;
}
export interface ClinicalServiceOrder { id:number;appointmentId:number;serviceId:number;code:string;name:string;group:string|null;performingUnit:string|null;unitPrice:string;purpose:string|null;priority:'Thuong'|'Khan';status:string;orderedAt:string;result:null|{id:number;result:string;conclusion:string|null;attachment:string|null;performedBy:string|null;reportedAt:string} }

export const clinicalApi={
  history:(params:Record<string,unknown>)=>api.get<PageResult<MedicalRecord>>('/medical-records/history',{params}).then(r=>r.data),
  diseases:(params:Record<string,unknown>)=>api.get<PageResult<Disease>&{groups:string[]}>('/diseases',{params}).then(r=>r.data),
  disease:(id:number)=>api.get<Disease>(`/diseases/${id}`).then(r=>r.data),
  createDisease:(body:DiseaseInput)=>api.post<Disease>('/diseases',body).then(r=>r.data),
  updateDisease:(id:number,body:DiseaseInput)=>api.put<Disease>(`/diseases/${id}`,body).then(r=>r.data),
  receptions:(params:Record<string,unknown>)=>api.get<PageResult<ReceptionItem>&{stats:ReceptionStats;tabs:ReceptionTabs}>('/reception',{params}).then(r=>r.data),
  reception:(id:number)=>api.get<ReceptionItem>(`/reception/${id}`).then(r=>r.data),
  confirmAppointment:(id:number)=>api.patch(`/reception/${id}/confirm`).then(r=>r.data),
  rejectAppointment:(id:number,reason:string)=>api.patch(`/reception/${id}/reject`,{reason}).then(r=>r.data),
  createReception:(body:ReceptionInput)=>api.post('/reception',body).then(r=>r.data),
  updateReception:(id:number,body:ReceptionInput)=>api.put(`/reception/${id}`,body).then(r=>r.data),
  startVisit:(id:number)=>api.post(`/clinical-visits/${id}/start`).then(r=>r.data),
  clinicalCatalog:(search='')=>api.get<{items:ClinicalServiceCatalogItem[]}>('/clinical-services/catalog',{params:{search:search||undefined}}).then(r=>r.data.items),
  catalogList:(params?:Record<string,unknown>)=>api.get<{items:ClinicalServiceCatalogItem[];total:number;page:number;limit:number;groups:string[]}>('/clinical-services/catalog',{params}).then(r=>r.data),
  createCatalogItem:(body:ClinicalServiceCatalogInput)=>api.post<{id:number}>('/clinical-services/catalog',body).then(r=>r.data),
  updateCatalogItem:(id:number,body:ClinicalServiceCatalogInput)=>api.put<{id:number}>(`/clinical-services/catalog/${id}`,body).then(r=>r.data),
  deleteCatalogItem:(id:number)=>api.delete<{id:number}>(`/clinical-services/catalog/${id}`).then(r=>r.data),
  saveOrderResult:(orderId:number,body:{result:string;conclusion?:string;attachment?:string})=>api.put(`/clinical-service-orders/${orderId}/result`,body).then(r=>r.data),
  clinicalOrders:(id:number)=>api.get<ClinicalServiceOrder[]>(`/clinical-visits/${id}/service-orders`).then(r=>r.data),
  createClinicalOrder:(id:number,body:{serviceId:number;purpose:string;priority?:'Thuong'|'Khan'})=>api.post(`/clinical-visits/${id}/service-orders`,body).then(r=>r.data),
  updateClinicalOrder:(id:number,body:{purpose:string;priority:'Thuong'|'Khan'})=>api.patch(`/clinical-service-orders/${id}`,body).then(r=>r.data),
  cancelClinicalOrder:(id:number)=>api.patch(`/clinical-service-orders/${id}/cancel`).then(r=>r.data),
  reviewClinicalResult:(id:number)=>api.patch(`/clinical-service-orders/${id}/review`).then(r=>r.data),
  saveMedicalRecord:(id:number,body:MedicalRecordInput)=>api.put(`/medical-records/appointments/${id}`,body).then(r=>r.data),
  completeVisit:(id:number)=>api.post(`/clinical-visits/${id}/complete`).then(r=>r.data),
};

export const billingApi={
  myInvoices:(params?:Record<string,unknown>)=>api.get<{items:InvoiceDetail[];total:number;page:number;limit:number}>('/billing/my-invoices',{params}).then(r=>r.data),
  invoice:(appointmentId:number)=>api.get<InvoiceDetail>(`/billing/appointments/${appointmentId}/invoice`).then(r=>r.data),
  createInvoice:(appointmentId:number,body:{examFee?:number})=>api.post<InvoiceDetail>(`/billing/appointments/${appointmentId}/invoice`,body).then(r=>r.data),
  recordPayment:(appointmentId:number,body:{amount:number;method:'Tien mat'|'Chuyen khoan';idempotencyKey:string;note?:string})=>api.post<InvoiceDetail>(`/billing/appointments/${appointmentId}/payments`,body).then(r=>r.data),
  patientCheckout:(appointmentId:number,body:{method?:string;idempotencyKey?:string;note?:string})=>api.post<InvoiceDetail>(`/billing/appointments/${appointmentId}/patient-checkout`,body).then(r=>r.data),
};

export const notificationApi={
  list:(params:Record<string,unknown>)=>api.get<PageResult<AppNotification>>('/notifications',{params}).then(r=>r.data),
  count:()=>api.get<{count:number}>('/notifications/unread-count').then(r=>r.data.count),
  read:(id:number)=>api.patch<AppNotification>(`/notifications/${id}/read`).then(r=>r.data),
  readAll:()=>api.patch('/notifications/read-all').then(r=>r.data),
};
