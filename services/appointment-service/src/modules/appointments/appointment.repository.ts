import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AppointmentStatus, todayInVietnam } from '@qlpk/common';
import { Repository } from 'typeorm';
import { LichHen } from './lich-hen.entity';

@Injectable()
export class AppointmentRepository {
  constructor(@InjectRepository(LichHen) private readonly appointments: Repository<LichHen>) {}

  bookedTimes(doctorId: number, date: string) {
    return this.appointments
      .createQueryBuilder('a')
      .where('a.idBacSi = :doctorId', { doctorId })
      .andWhere('a.ngayHen = :date', { date })
      .andWhere('a.trangThai <> :cancelled', { cancelled: AppointmentStatus.CANCELLED })
      .getMany();
  }

  async paginate(patientId: number, page: number, pageSize: number, upcoming: boolean) {
    const query = this.appointments
      .createQueryBuilder('a')
      .where('a.idBenhNhan = :patientId', { patientId })
      .orderBy('a.ngayHen', upcoming ? 'ASC' : 'DESC')
      .addOrderBy('a.gioHen', upcoming ? 'ASC' : 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    if (upcoming) {
      query
        .andWhere('a.ngayHen >= :today', { today: todayInVietnam() })
        .andWhere('a.trangThai NOT IN (:...done)', { done: [AppointmentStatus.CANCELLED, AppointmentStatus.COMPLETED] });
    }
    const [items, total] = await query.getManyAndCount();
    return { items, total };
  }

  async counts() {
    const today = todayInVietnam();
    const todayCount = await this.appointments
      .createQueryBuilder('a')
      .where('a.ngayHen = :today', { today })
      .andWhere('a.trangThai <> :cancelled', { cancelled: AppointmentStatus.CANCELLED })
      .getCount();
    const start = startOfCurrentWeek(today);
    const end = addSix(start);
    const weekCount = await this.appointments
      .createQueryBuilder('a')
      .where('a.ngayHen BETWEEN :start AND :end', { start, end })
      .andWhere('a.trangThai <> :cancelled', { cancelled: AppointmentStatus.CANCELLED })
      .getCount();
    return { today: todayCount, week: weekCount };
  }
}

function startOfCurrentWeek(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay();
  const diff = weekday === 0 ? -6 : 1 - weekday;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

function addSix(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + 6));
  return date.toISOString().slice(0, 10);
}
