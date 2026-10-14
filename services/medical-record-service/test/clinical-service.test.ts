import assert from 'node:assert/strict';
import test from 'node:test';
import { AppRole, AppointmentStatus } from '@qlpk/common';
import { ClinicalServiceService } from '../src/clinical-service.service';

const doctor={sub:'doctor-account',username:'doctor',vaiTro:'BacSi',role:AppRole.DOCTOR,type:'access'} as const;

test('clinical order locks a visit scoped to the assigned doctor',async()=>{
  const calls:Array<{sql:string;parameters:unknown[]}>=[];
  const manager={async query(sql:string,parameters:unknown[]){calls.push({sql,parameters});if(sql.includes('FOR UPDATE OF lh'))return [{id:12,status:AppointmentStatus.IN_PROGRESS,doctorId:7}];if(sql.includes('FROM danh_muc_dich_vu_lam_sang'))return [{id_dich_vu:3}];if(sql.includes('INSERT INTO chi_dinh'))return [{id:91}];return [];}};
  const service=new ClinicalServiceService({transaction:(callback:(value:typeof manager)=>unknown)=>callback(manager)} as never);
  const result=await service.createOrder(doctor as never,12,{serviceId:3,purpose:'Xác định tổn thương',priority:'Khan'});
  assert.equal(result.id,91);assert.deepEqual(calls[0].parameters,[12,doctor.sub]);assert.match(calls[0].sql,/bs\.id_tai_khoan=\$2/);
});

test('real clinical result creates one idempotent doctor notification',async()=>{
  const calls:Array<{sql:string;parameters:unknown[]}>=[];
  const manager={async query(sql:string,parameters:unknown[]){calls.push({sql,parameters});if(sql.includes('FOR UPDATE OF cd'))return [{id:91,appointmentId:12,serviceName:'Soi da',doctorAccountId:'doctor-account'}];return [];}};
  const service=new ClinicalServiceService({transaction:(callback:(value:typeof manager)=>unknown)=>callback(manager)} as never);
  await service.saveResult(91,{result:'Kết quả đã xác nhận',conclusion:'Theo dõi'});
  const notification=calls.find(call=>call.sql.includes('INSERT INTO thong_bao'));
  assert.ok(notification);assert.match(notification!.sql,/ON CONFLICT\(ma_su_kien\) DO NOTHING/);assert.ok(notification!.parameters.includes('clinical-result-doctor:91'));
});

test('doctor can edit or cancel only a pending clinical order in an in-progress visit',async()=>{
  const calls:Array<{sql:string;parameters:unknown[]}>=[];
  const db={async query(sql:string,parameters:unknown[]){calls.push({sql,parameters});return [{id:91}];}};
  const service=new ClinicalServiceService(db as never);

  await service.updateOrder(doctor as never,91,{purpose:'Kiểm tra lại',priority:'Thuong'});
  await service.cancelOrder(doctor as never,91);

  assert.ok(calls[0].sql.includes("cd.trang_thai='Cho thuc hien'"));
  assert.ok(calls[0].sql.includes('bs.id_tai_khoan=$2'));
  assert.ok(calls[1].sql.includes("SET trang_thai='Huy'"));
  assert.deepEqual(calls[1].parameters,[91,doctor.sub,AppointmentStatus.IN_PROGRESS]);
});
