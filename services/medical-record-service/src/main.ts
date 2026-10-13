import './load-env';
import 'reflect-metadata';
import { Body, Controller, Get, Inject, Injectable, Module, Param, ParseIntPipe, Post, Put, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessTokenPayload, AllExceptionsFilter, AppException, AppRole, CurrentUser, ErrorCode, JwtAuthGuard, Roles, RolesGuard, isDbConflict } from '@qlpk/common';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { DataSource } from 'typeorm';

class PageQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 10;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() patientId?: number;
  @IsOptional() @Type(() => Number) @IsInt() doctorId?: number;
}

class DiseaseQuery extends PageQuery {
  @IsOptional() @IsString() group?: string;
}

class DiseaseDto {
  @IsString() @MinLength(1) @MaxLength(50) code!: string;
  @IsString() @MinLength(1) @MaxLength(255) name!: string;
  @IsOptional() @IsString() @MaxLength(100) group?: string;
  @IsOptional() @IsString() description?: string;
}

class ReceptionQuery extends PageQuery {
  @IsOptional() @Type(() => Number) @IsInt() appointmentId?: number;
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsString() status?: string;
}

class ReceptionDto {
  @Type(() => Number) @IsInt() @Min(1) appointmentId!: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.01) weight?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.01) height?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(30) @Max(45) temperature?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) systolicBloodPressure?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) diastolicBloodPressure?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) heartRate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) spo2?: number;
  @IsOptional() @IsString() initialSymptoms?: string;
  @IsOptional() @IsString() notes?: string;
}

function clean(value?: string) { return value?.trim() || null; }

@Injectable()
export class MedicalService {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  async history(user: AccessTokenPayload, q: PageQuery) {
    const where: string[] = []; const values: unknown[] = [];
    const add = (sql: string, value: unknown) => { values.push(value); where.push(sql.replace('?', `$${values.length}`)); };
    if (user.role === AppRole.PATIENT) add(`EXISTS (
      SELECT 1 FROM tai_khoan_benh_nhan owner
      WHERE owner.id_benh_nhan = bn.id_benh_nhan AND owner.id_tai_khoan = ?
        AND owner.la_chu_ho_so = TRUE AND owner.trang_thai = 'Active'
    )`, user.sub);
    else if (user.role === AppRole.DOCTOR) add('bs.id_tai_khoan = ?', user.sub);
    else if (q.patientId) add('pk.id_benh_nhan = ?', q.patientId);
    if (user.role === AppRole.MANAGER && q.doctorId) add('pk.id_bac_si = ?', q.doctorId);
    if (q.from) add('pk.ngay_kham >= ?', q.from.slice(0, 10));
    if (q.to) add('pk.ngay_kham <= ?', q.to.slice(0, 10));
    if (q.search) { values.push(`%${q.search.trim()}%`); where.push(`(bn.ho_ten ILIKE $${values.length} OR CAST(pk.id_phieu_kham AS text) ILIKE $${values.length} OR CAST(lh.id_lich_hen AS text) ILIKE $${values.length})`); }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const count = await this.db.query(`SELECT COUNT(*)::int total FROM phieu_kham pk JOIN benh_nhan bn ON bn.id_benh_nhan=pk.id_benh_nhan JOIN bac_si bs ON bs.id_bac_si=pk.id_bac_si JOIN lich_hen lh ON lh.id_lich_hen=pk.id_lich_hen ${clause}`, values);
    values.push(q.limit, (q.page - 1) * q.limit);
    const rows = await this.db.query(`
      SELECT pk.id_phieu_kham id, pk.id_lich_hen "appointmentId", pk.ngay_kham::text "examDate", pk.trieu_chung symptoms,
        pk.ket_qua_kham "examResult", pk.ket_luan conclusion, pk.huong_dieu_tri treatment,
        pk.ghi_chu_bac_si "doctorNotes", pk.ngay_tai_kham::text "followUpDate", pk.phi_kham "examFee",
        jsonb_build_object('id',bn.id_benh_nhan,'code','BN-'||LPAD(bn.id_benh_nhan::text,5,'0'),'name',bn.ho_ten,'phone',bn.so_dien_thoai,'birthDate',bn.ngay_sinh::text) patient,
        jsonb_build_object('id',bs.id_bac_si,'code','BS-'||LPAD(bs.id_bac_si::text,4,'0'),'name',bs.ho_ten) doctor,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('id',cd.id_chan_doan,'code',dm.ma_benh,'name',dm.ten_benh,'primary',cd.la_chan_doan_chinh,'note',cd.ghi_chu) ORDER BY cd.la_chan_doan_chinh DESC) FROM chan_doan cd JOIN danh_muc_ten_benh dm ON dm.id_danh_muc_ten_benh=cd.id_danh_muc_ten_benh WHERE cd.id_phieu_kham=pk.id_phieu_kham),'[]') diagnoses,
        (SELECT jsonb_build_object('id',dt.id_don_thuoc,'date',dt.ngay_ke_don::text,'status',dt.trang_thai,'note',dt.ghi_chu,'items',COALESCE((SELECT jsonb_agg(jsonb_build_object('drug',t.ten_thuoc,'strength',t.ham_luong,'quantity',ct.so_luong,'dosage',ct.lieu_dung,'frequency',ct.tan_suat,'days',ct.so_ngay_dung,'route',ct.duong_dung,'instructions',ct.huong_dan)) FROM chi_tiet_don_thuoc ct JOIN thuoc t ON t.id_thuoc=ct.id_thuoc WHERE ct.id_don_thuoc=dt.id_don_thuoc),'[]')) FROM don_thuoc dt WHERE dt.id_phieu_kham=pk.id_phieu_kham) prescription,
        (SELECT jsonb_build_object('id',hd.id_hoa_don,'date',hd.ngay_lap::text,'examFee',hd.phi_kham,'medicineAmount',hd.tien_thuoc,'total',hd.tong_tien,'status',hd.trang_thai_thanh_toan,'payments',COALESCE((SELECT jsonb_agg(jsonb_build_object('amount',tt.so_tien,'method',tt.phuong_thuc_thanh_toan,'status',tt.trang_thai,'paidAt',tt.thoi_gian_thanh_toan)) FROM thanh_toan tt WHERE tt.id_hoa_don=hd.id_hoa_don),'[]')) FROM hoa_don hd WHERE hd.id_phieu_kham=pk.id_phieu_kham) invoice
      FROM phieu_kham pk JOIN lich_hen lh ON lh.id_lich_hen=pk.id_lich_hen JOIN benh_nhan bn ON bn.id_benh_nhan=pk.id_benh_nhan JOIN bac_si bs ON bs.id_bac_si=pk.id_bac_si
      ${clause} ORDER BY pk.ngay_kham DESC, pk.id_phieu_kham DESC LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
    return { items: rows, total: count[0].total, page: q.page, limit: q.limit };
  }

  async diseases(q: DiseaseQuery) {
    const where: string[]=[]; const values: unknown[]=[];
    if(q.search){values.push(`%${q.search.trim()}%`);where.push(`(ma_benh ILIKE $${values.length} OR ten_benh ILIKE $${values.length})`)}
    if(q.group){values.push(q.group);where.push(`nhom_benh=$${values.length}`)}
    const clause=where.length?`WHERE ${where.join(' AND ')}`:''; const total=(await this.db.query(`SELECT COUNT(*)::int total FROM danh_muc_ten_benh ${clause}`,values))[0].total;
    values.push(q.limit,(q.page-1)*q.limit); const rows=await this.db.query(`SELECT id_danh_muc_ten_benh id,ma_benh code,ten_benh name,mo_ta description,nhom_benh "group",ngay_tao "createdAt",ngay_cap_nhat "updatedAt" FROM danh_muc_ten_benh ${clause} ORDER BY ten_benh LIMIT $${values.length-1} OFFSET $${values.length}`,values);
    const groups=(await this.db.query(`SELECT DISTINCT nhom_benh value FROM danh_muc_ten_benh WHERE nhom_benh IS NOT NULL ORDER BY nhom_benh`)).map((r:{value:string})=>r.value);
    return {items:rows,total,page:q.page,limit:q.limit,groups};
  }
  async disease(id:number){const rows=await this.db.query(`SELECT id_danh_muc_ten_benh id,ma_benh code,ten_benh name,mo_ta description,nhom_benh "group",ngay_tao "createdAt",ngay_cap_nhat "updatedAt" FROM danh_muc_ten_benh WHERE id_danh_muc_ten_benh=$1`,[id]); if(!rows.length)throw new AppException(404,'DISEASE_NOT_FOUND','Không tìm thấy bệnh.'); return rows[0];}
  async saveDisease(id:number|null,dto:DiseaseDto){const code=dto.code.trim();const name=dto.name.trim();if(!code||!name)throw new AppException(400,ErrorCode.VALIDATION_ERROR,'Mã bệnh và tên bệnh là bắt buộc.');try{if(id){const r=await this.db.query(`UPDATE danh_muc_ten_benh SET ma_benh=$1,ten_benh=$2,nhom_benh=$3,mo_ta=$4,ngay_cap_nhat=CURRENT_TIMESTAMP WHERE id_danh_muc_ten_benh=$5 RETURNING id_danh_muc_ten_benh id`,[code,name,clean(dto.group),clean(dto.description),id]);if(!r.length)throw new AppException(404,'DISEASE_NOT_FOUND','Không tìm thấy bệnh.');return this.disease(id)}const r=await this.db.query(`INSERT INTO danh_muc_ten_benh(ma_benh,ten_benh,nhom_benh,mo_ta) VALUES($1,$2,$3,$4) RETURNING id_danh_muc_ten_benh id`,[code,name,clean(dto.group),clean(dto.description)]);return this.disease(Number(r[0].id));}catch(e){if(isDbConflict(e))throw new AppException(409,'DISEASE_DUPLICATE','Mã bệnh hoặc tên bệnh đã tồn tại.');throw e}}

  async receptions(user:AccessTokenPayload,q:ReceptionQuery){const where:string[]=[];const values:unknown[]=[];if(user.role===AppRole.DOCTOR){values.push(user.sub);where.push(`bs.id_tai_khoan=$${values.length}`)}if(q.appointmentId){values.push(q.appointmentId);where.push(`lh.id_lich_hen=$${values.length}`)}if(q.date){values.push(q.date.slice(0,10));where.push(`lh.ngay_hen=$${values.length}`)}if(q.status){values.push(q.status);where.push(`lh.trang_thai=$${values.length}`)}if(q.search){values.push(`%${q.search.trim()}%`);where.push(`(bn.ho_ten ILIKE $${values.length} OR bn.so_dien_thoai ILIKE $${values.length} OR ('BN-'||LPAD(bn.id_benh_nhan::text,5,'0')) ILIKE $${values.length})`)}const clause=where.length?`WHERE ${where.join(' AND ')}`:'';const total=(await this.db.query(`SELECT COUNT(*)::int total FROM lich_hen lh JOIN benh_nhan bn ON bn.id_benh_nhan=lh.id_benh_nhan JOIN bac_si bs ON bs.id_bac_si=lh.id_bac_si ${clause}`,values))[0].total;values.push(q.limit,(q.page-1)*q.limit);const items=await this.db.query(`SELECT lh.id_lich_hen "appointmentId",lh.ngay_hen::text date,lh.gio_hen::text time,lh.trang_thai status,lh.thoi_gian_check_in "checkedInAt",jsonb_build_object('id',bn.id_benh_nhan,'code','BN-'||LPAD(bn.id_benh_nhan::text,5,'0'),'name',bn.ho_ten,'phone',bn.so_dien_thoai) patient,jsonb_build_object('id',bs.id_bac_si,'name',bs.ho_ten) doctor,CASE WHEN tn.id_tiep_nhan_benh_nhan IS NULL THEN NULL ELSE jsonb_build_object('id',tn.id_tiep_nhan_benh_nhan,'weight',tn.can_nang,'height',tn.chieu_cao,'temperature',tn.nhiet_do,'systolicBloodPressure',tn.huyet_ap_tam_thu,'diastolicBloodPressure',tn.huyet_ap_tam_truong,'heartRate',tn.nhip_tim,'spo2',tn.spo2,'initialSymptoms',tn.trieu_chung_ban_dau,'notes',tn.ghi_chu,'recordedAt',tn.thoi_gian_ghi_nhan) END reception FROM lich_hen lh JOIN benh_nhan bn ON bn.id_benh_nhan=lh.id_benh_nhan JOIN bac_si bs ON bs.id_bac_si=lh.id_bac_si LEFT JOIN tiep_nhan_benh_nhan tn ON tn.id_lich_hen=lh.id_lich_hen ${clause} ORDER BY lh.ngay_hen DESC,lh.gio_hen LIMIT $${values.length-1} OFFSET $${values.length}`,values);return{items,total,page:q.page,limit:q.limit}}
  async saveReception(user:AccessTokenPayload,appointmentId:number,dto:ReceptionDto,update:boolean){return this.db.transaction(async manager=>{const scope=user.role===AppRole.DOCTOR?' AND bs.id_tai_khoan=$2':'';const args=user.role===AppRole.DOCTOR?[appointmentId,user.sub]:[appointmentId];const appts=await manager.query(`SELECT lh.id_lich_hen FROM lich_hen lh JOIN bac_si bs ON bs.id_bac_si=lh.id_bac_si WHERE lh.id_lich_hen=$1${scope} FOR UPDATE`,args);if(!appts.length)throw new AppException(404,'APPOINTMENT_NOT_FOUND','Không tìm thấy lịch hẹn phù hợp.');const vals=[dto.weight??null,dto.height??null,dto.temperature??null,dto.systolicBloodPressure??null,dto.diastolicBloodPressure??null,dto.heartRate??null,dto.spo2??null,clean(dto.initialSymptoms),clean(dto.notes),appointmentId];if(update){const r=await manager.query(`UPDATE tiep_nhan_benh_nhan SET can_nang=$1,chieu_cao=$2,nhiet_do=$3,huyet_ap_tam_thu=$4,huyet_ap_tam_truong=$5,nhip_tim=$6,spo2=$7,trieu_chung_ban_dau=$8,ghi_chu=$9,thoi_gian_ghi_nhan=CURRENT_TIMESTAMP WHERE id_lich_hen=$10 RETURNING id_tiep_nhan_benh_nhan id`,vals);if(!r.length)throw new AppException(404,'RECEPTION_NOT_FOUND','Lịch hẹn chưa được tiếp nhận.');return r[0]}try{const r=await manager.query(`INSERT INTO tiep_nhan_benh_nhan(can_nang,chieu_cao,nhiet_do,huyet_ap_tam_thu,huyet_ap_tam_truong,nhip_tim,spo2,trieu_chung_ban_dau,ghi_chu,id_lich_hen) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id_tiep_nhan_benh_nhan id`,vals);await manager.query(`UPDATE lich_hen SET thoi_gian_check_in=COALESCE(thoi_gian_check_in,CURRENT_TIMESTAMP),ngay_cap_nhat=CURRENT_TIMESTAMP WHERE id_lich_hen=$1`,[appointmentId]);return r[0]}catch(e){if(isDbConflict(e))throw new AppException(409,'RECEPTION_EXISTS','Lịch hẹn này đã được tiếp nhận.');throw e}})}
}

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
class HealthController {
  constructor(@Inject(MedicalService) private readonly service:MedicalService){}
  @Get('health') health(){return{status:'ok',service:'medical-record-service'}}
  @Get('medical-records/history') @Roles(AppRole.PATIENT,AppRole.DOCTOR,AppRole.MANAGER) history(@CurrentUser()u:AccessTokenPayload,@Query()q:PageQuery){return this.service.history(u,q)}
  @Get('diseases') @Roles(AppRole.DOCTOR,AppRole.MANAGER) diseases(@Query()q:DiseaseQuery){return this.service.diseases(q)}
  @Get('diseases/:id') @Roles(AppRole.DOCTOR,AppRole.MANAGER) disease(@Param('id',ParseIntPipe)id:number){return this.service.disease(id)}
  @Post('diseases') @Roles(AppRole.MANAGER) createDisease(@Body()d:DiseaseDto){return this.service.saveDisease(null,d)}
  @Put('diseases/:id') @Roles(AppRole.MANAGER) updateDisease(@Param('id',ParseIntPipe)id:number,@Body()d:DiseaseDto){return this.service.saveDisease(id,d)}
  @Get('reception') @Roles(AppRole.DOCTOR,AppRole.MANAGER) receptions(@CurrentUser()u:AccessTokenPayload,@Query()q:ReceptionQuery){return this.service.receptions(u,q)}
  @Get('reception/:appointmentId') @Roles(AppRole.DOCTOR,AppRole.MANAGER) async reception(@CurrentUser()u:AccessTokenPayload,@Param('appointmentId',ParseIntPipe)id:number){const result=await this.service.receptions(u,Object.assign(new ReceptionQuery(),{page:1,limit:1,appointmentId:id}));if(!result.items.length)throw new AppException(404,'RECEPTION_NOT_FOUND','Không tìm thấy lịch hẹn phù hợp.');return result.items[0]}
  @Post('reception') @Roles(AppRole.DOCTOR,AppRole.MANAGER) createReception(@CurrentUser()u:AccessTokenPayload,@Body()d:ReceptionDto){return this.service.saveReception(u,d.appointmentId,d,false)}
  @Put('reception/:appointmentId') @Roles(AppRole.DOCTOR,AppRole.MANAGER) updateReception(@CurrentUser()u:AccessTokenPayload,@Param('appointmentId',ParseIntPipe)id:number,@Body()d:ReceptionDto){return this.service.saveReception(u,id,d,true)}
}

@Module({imports:[TypeOrmModule.forRoot({type:'postgres',host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||5433),username:process.env.DB_USER||'postgres',password:process.env.DB_PASSWORD||'postgres',database:process.env.DB_NAME||'qlphongkham',synchronize:false}),JwtModule.register({secret:process.env.JWT_ACCESS_SECRET})],controllers:[HealthController],providers:[MedicalService]})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true,forbidNonWhitelisted:true}));
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.listen(Number(process.env.MEDICAL_RECORD_PORT || 3010));
}

if (require.main === module) void bootstrap();
