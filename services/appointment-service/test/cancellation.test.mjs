import assert from 'node:assert/strict';
import test from 'node:test';
import { AppointmentService } from '../dist/modules/appointments/appointment.service.js';
const AppointmentStatus={CONFIRMED:'Da xac nhan',CHECKED_IN:'Da check-in',CANCELLED:'Huy'};

test('patient cancellation is account-scoped, atomic and invalidates availability', async () => {
  const calls = []; const deleted = [];
  const manager = { async query(sql,parameters){calls.push({sql,parameters});if(sql.includes('FOR UPDATE OF lh'))return [{id:44,doctorId:7,date:'2099-01-12',time:'08:30:00',status:AppointmentStatus.CONFIRMED,patientName:'Nguyễn An',doctorAccountId:'doctor-account'}];return [];} };
  const db = { transaction:(callback)=>callback(manager) };
  const service = new AppointmentService({},db,{client:{del:async(key)=>{deleted.push(key)}}},{});
  const result = await service.cancel('patient-account',44,'Có việc đột xuất');
  assert.equal(result.status,AppointmentStatus.CANCELLED);
  assert.deepEqual(calls[0].parameters,[44,'patient-account']);
  assert.match(calls[0].sql,/id_tai_khoan_dat = \$2[\s\S]*FOR UPDATE/);
  assert.ok(calls.some(call=>call.sql.includes('Benh nhan huy lich')));
  assert.ok(calls.some(call=>call.parameters?.includes('appointment-cancelled-doctor:44')));
  assert.deepEqual(deleted,['availability:7:2099-01-12']);
});

test('a checked-in appointment cannot be cancelled by the patient', async () => {
  const manager = { async query(sql){if(sql.includes('FOR UPDATE OF lh'))return [{id:45,doctorId:7,date:'2099-01-12',time:'08:30:00',status:AppointmentStatus.CHECKED_IN,patientName:'Nguyễn An',doctorAccountId:'doctor-account'}];return [];} };
  const service = new AppointmentService({},{transaction:(callback)=>callback(manager)},{client:{del:async()=>0}},{});
  await assert.rejects(service.cancel('patient-account',45,'Đổi kế hoạch'),(error)=>error.getResponse?.().code==='APPOINTMENT_STATUS_INVALID');
});
