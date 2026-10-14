import './load-env';
import 'reflect-metadata';
import { Body, Controller, Delete, Get, Inject, Injectable, Module, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessTokenPayload, AllExceptionsFilter, AppException, AppRole, CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '@qlpk/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { DataSource } from 'typeorm';

class NotificationQuery {
  @IsOptional() @Type(()=>Number) @IsInt() @Min(1) page=1;
  @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=10;
  @IsOptional() @IsString() unreadOnly?:string;
  @IsOptional() @IsString() @IsIn(['all','unread','read']) readStatus?:string;
  @IsOptional() @IsString() type?:string;
  @IsOptional() @IsString() date?:string;
}
class NotificationDto {
  @IsString() accountId!:string;
  @IsOptional() @Type(()=>Number) @IsInt() appointmentId?:number;
  @IsString() @MinLength(1) type!:string;
  @IsString() @MinLength(1) title!:string;
  @IsString() @MinLength(1) content!:string;
}

@Injectable()
class NotificationService {
  constructor(@Inject(DataSource) private readonly db:DataSource){}
  async list(accountId:string,q:NotificationQuery){const where=['id_tai_khoan=$1'];const values:unknown[]=[accountId];const readStatus=q.readStatus||(q.unreadOnly==='true'?'unread':'all');if(readStatus==='unread')where.push(`thoi_gian_doc IS NULL`);if(readStatus==='read')where.push(`thoi_gian_doc IS NOT NULL`);if(q.type){values.push(q.type);where.push(`loai=$${values.length}`)}if(q.date){values.push(q.date.slice(0,10));where.push(`ngay_tao::date=$${values.length}`)}const clause=`WHERE ${where.join(' AND ')}`;const total=(await this.db.query(`SELECT COUNT(*)::int total FROM thong_bao ${clause}`,values))[0].total;values.push(q.limit,(q.page-1)*q.limit);const items=await this.db.query(`SELECT id_thong_bao id,id_lich_hen "appointmentId",loai type,kenh channel,tieu_de title,noi_dung content,trang_thai status,duong_dan link,thoi_gian_du_kien_gui "scheduledAt",thoi_gian_gui "sentAt",thoi_gian_doc "readAt",ngay_tao "createdAt" FROM thong_bao ${clause} ORDER BY ngay_tao DESC,id_thong_bao DESC LIMIT $${values.length-1} OFFSET $${values.length}`,values);return{items,total,page:q.page,limit:q.limit}}
  async count(accountId:string){const r=await this.db.query(`SELECT COUNT(*)::int count FROM thong_bao WHERE id_tai_khoan=$1 AND thoi_gian_doc IS NULL`,[accountId]);return{count:r[0].count}}
  async one(accountId:string,id:number){const r=await this.db.query(`SELECT id_thong_bao id,id_lich_hen "appointmentId",loai type,kenh channel,tieu_de title,noi_dung content,trang_thai status,duong_dan link,thoi_gian_doc "readAt",ngay_tao "createdAt" FROM thong_bao WHERE id_thong_bao=$1 AND id_tai_khoan=$2`,[id,accountId]);if(!r.length)throw new AppException(404,'NOTIFICATION_NOT_FOUND','Không tìm thấy thông báo.');return r[0]}
  async read(accountId:string,id:number){const r=await this.db.query(`UPDATE thong_bao SET thoi_gian_doc=COALESCE(thoi_gian_doc,CURRENT_TIMESTAMP),trang_thai='Da doc' WHERE id_thong_bao=$1 AND id_tai_khoan=$2 RETURNING id_thong_bao`,[id,accountId]);if(!r.length)throw new AppException(404,'NOTIFICATION_NOT_FOUND','Không tìm thấy thông báo.');return this.one(accountId,id)}
  async readAll(accountId:string){const r=await this.db.query(`UPDATE thong_bao SET thoi_gian_doc=COALESCE(thoi_gian_doc,CURRENT_TIMESTAMP),trang_thai='Da doc' WHERE id_tai_khoan=$1 AND thoi_gian_doc IS NULL`,[accountId]);return{success:true,updated:r[1]??0}}
  async create(dto:NotificationDto){const r=await this.db.query(`INSERT INTO thong_bao(id_tai_khoan,id_lich_hen,loai,kenh,tieu_de,noi_dung,trang_thai,thoi_gian_gui) VALUES($1,$2,$3,'Ung dung',$4,$5,'Chua doc',CURRENT_TIMESTAMP) RETURNING id_thong_bao id`,[dto.accountId,dto.appointmentId??null,dto.type.trim(),dto.title.trim(),dto.content.trim()]);return r[0]}
  async update(id:number,dto:NotificationDto){const r=await this.db.query(`UPDATE thong_bao SET id_tai_khoan=$1,id_lich_hen=$2,loai=$3,tieu_de=$4,noi_dung=$5 WHERE id_thong_bao=$6 RETURNING id_thong_bao id`,[dto.accountId,dto.appointmentId??null,dto.type.trim(),dto.title.trim(),dto.content.trim(),id]);if(!r.length)throw new AppException(404,'NOTIFICATION_NOT_FOUND','Không tìm thấy thông báo.');return r[0]}
  async remove(id:number){const r=await this.db.query(`DELETE FROM thong_bao WHERE id_thong_bao=$1 RETURNING id_thong_bao`,[id]);if(!r.length)throw new AppException(404,'NOTIFICATION_NOT_FOUND','Không tìm thấy thông báo.');return{success:true}}
}

@Controller()
class SystemHealthController {
  @Get('health') health(){return{status:'ok',service:'notification-service'}}
}

@Controller('notifications')
@UseGuards(JwtAuthGuard,RolesGuard)
class NotificationsController {
  constructor(@Inject(NotificationService) private readonly service:NotificationService){}
  @Get() list(@CurrentUser()u:AccessTokenPayload,@Query()q:NotificationQuery){return this.service.list(u.sub,q)}
  @Get('unread-count') count(@CurrentUser()u:AccessTokenPayload){return this.service.count(u.sub)}
  @Patch('read-all') readAll(@CurrentUser()u:AccessTokenPayload){return this.service.readAll(u.sub)}
  @Get(':id') one(@CurrentUser()u:AccessTokenPayload,@Param('id',ParseIntPipe)id:number){return this.service.one(u.sub,id)}
  @Patch(':id/read') read(@CurrentUser()u:AccessTokenPayload,@Param('id',ParseIntPipe)id:number){return this.service.read(u.sub,id)}
  @Post() @Roles(AppRole.MANAGER) create(@Body()d:NotificationDto){return this.service.create(d)}
  @Put(':id') @Roles(AppRole.MANAGER) update(@Param('id',ParseIntPipe)id:number,@Body()d:NotificationDto){return this.service.update(id,d)}
  @Delete(':id') @Roles(AppRole.MANAGER) remove(@Param('id',ParseIntPipe)id:number){return this.service.remove(id)}
}

@Module({imports:[TypeOrmModule.forRoot({type:'postgres',host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||5433),username:process.env.DB_USER||'postgres',password:process.env.DB_PASSWORD||'postgres',database:process.env.DB_NAME||'qlphongkham',synchronize:false}),JwtModule.register({secret:process.env.JWT_ACCESS_SECRET})],controllers:[SystemHealthController,NotificationsController],providers:[NotificationService]})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true,forbidNonWhitelisted:true}));app.useGlobalFilters(new AllExceptionsFilter());
  await app.listen(Number(process.env.NOTIFICATION_PORT || 3013));
}

bootstrap();
