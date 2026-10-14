import assert from 'node:assert/strict';
import test from 'node:test';
import { AppRole, AppointmentStatus, PaymentMethod, PaymentStatus } from '@qlpk/common';
import { BillingService } from '../src/billing.service';

const managerUser = {
  sub: 'manager-account',
  username: 'admin',
  vaiTro: 'Admin',
  role: AppRole.MANAGER,
  type: 'access',
} as const;

test('invoice uses real examination, clinical service and prescribed medicine price snapshots', async () => {
  const calls: Array<{ sql: string; parameters: unknown[] }> = [];
  const manager = {
    async query(sql: string, parameters: unknown[]) {
      calls.push({ sql, parameters });
      if (sql.includes('FOR UPDATE OF lh, pk')) {
        return [{ appointmentId: 9, recordId: 4, patientId: 2, status: AppointmentStatus.EXAM_COMPLETED, examFee: '100000', invoiceId: null }];
      }
      if (sql.includes('ct.so_luong * ct.don_gia_tai_thoi_diem_ke')) return [{ amount: '25000' }];
      if (sql.includes('FROM chi_dinh_dich_vu_lam_sang')) return [{ amount: '50000' }];
      return [];
    },
  };
  const db = {
    transaction: (callback: (value: typeof manager) => unknown) => callback(manager),
    async query() { return [{ id: 'HD-LH-00000009', total: '175000', status: PaymentStatus.UNPAID }]; },
  };
  const service = new BillingService(db as never);

  const result = await service.createInvoice(managerUser as never, 9);

  assert.equal(result.total, '175000');
  const insert = calls.find((call) => call.sql.includes('INSERT INTO hoa_don'));
  assert.deepEqual(insert?.parameters?.slice(3, 7), [100000, 50000, 25000, 175000]);
});

test('full manually confirmed payment completes an exam-finished visit in one transaction', async () => {
  const calls: Array<{ sql: string; parameters: unknown[] }> = [];
  const transactionManager = {
    async query(sql: string, parameters: unknown[]) {
      calls.push({ sql, parameters });
      if (sql.includes('FOR UPDATE OF hd, lh')) {
        return [{ invoiceId: 'HD-LH-00000011', appointmentId: 11, total: '150000', status: PaymentStatus.UNPAID }];
      }
      if (sql.includes('WHERE ma_giao_dich')) return [];
      if (sql.includes('COALESCE(SUM(so_tien)')) return [{ paid: '50000' }];
      if (sql.includes('RETURNING id_lich_hen')) return [{ id_lich_hen: 11 }];
      return [];
    },
  };
  const db = {
    transaction: (callback: (value: typeof transactionManager) => unknown) => callback(transactionManager),
    async query() { return [{ id: 'HD-LH-00000011', total: '150000', paidAmount: '150000', status: PaymentStatus.PAID }]; },
  };
  const service = new BillingService(db as never);

  const result = await service.recordPayment(managerUser as never, 11, {
    amount: 100000,
    method: PaymentMethod.CASH,
    idempotencyKey: 'TM-11-2',
  });

  assert.equal(result.status, PaymentStatus.PAID);
  assert.ok(calls.some((call) => call.sql.includes('INSERT INTO thanh_toan')));
  const visitUpdate = calls.find((call) => call.sql.includes('thoi_gian_hoan_tat_luot_kham'));
  assert.deepEqual(visitUpdate?.parameters, [11, AppointmentStatus.COMPLETED, AppointmentStatus.EXAM_COMPLETED]);
  assert.ok(calls.some((call) => call.parameters.includes('Hoan tat thanh toan')));
});

test('partial payment keeps the visit exam-completed and does not mark the workflow complete', async () => {
  const calls: Array<{ sql: string; parameters: unknown[] }> = [];
  const transactionManager = {
    async query(sql: string, parameters: unknown[]) {
      calls.push({ sql, parameters });
      if (sql.includes('FOR UPDATE OF hd, lh')) {
        return [{ invoiceId: 'HD-LH-00000015', appointmentId: 15, total: '200000', status: PaymentStatus.UNPAID }];
      }
      if (sql.includes('WHERE ma_giao_dich')) return [];
      if (sql.includes('COALESCE(SUM(so_tien)')) return [{ paid: '0' }];
      return [];
    },
  };
  const db = {
    transaction: (callback: (value: typeof transactionManager) => unknown) => callback(transactionManager),
    async query() { return [{ id: 'HD-LH-00000015', total: '200000', paidAmount: '50000', status: PaymentStatus.PARTIALLY_PAID }]; },
  };
  const service = new BillingService(db as never);

  const result = await service.recordPayment(managerUser as never, 15, {
    amount: 50000,
    method: PaymentMethod.CASH,
    idempotencyKey: 'TM-15-1',
  });

  assert.equal(result.status, PaymentStatus.PARTIALLY_PAID);
  assert.equal(calls.some((call) => call.sql.includes('thoi_gian_hoan_tat_luot_kham')), false);
  const invoiceUpdate = calls.find((call) => call.sql.includes('UPDATE hoa_don'));
  assert.deepEqual(invoiceUpdate?.parameters, ['HD-LH-00000015', PaymentStatus.PARTIALLY_PAID]);
});

test('manager without explicit payment permission cannot create an invoice', async () => {
  const db = {
    async query() { return []; },
    transaction() { throw new Error('transaction must not start'); },
  };
  const service = new BillingService(db as never);

  await assert.rejects(
    service.createInvoice(managerUser as never, 99),
    (error: { getResponse?: () => { code?: string } }) => error.getResponse?.().code === 'PAYMENT_PERMISSION_REQUIRED',
  );
});
