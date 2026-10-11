import { Injectable, StreamableFile } from '@nestjs/common';
import { AppException, ErrorCode } from '@qlpk/common';
import { createReadStream } from 'fs';
import { mkdir, readdir, rm, writeFile } from 'fs/promises';
import { extname, join, resolve } from 'path';

export interface DoctorPhotoUpload {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

const extensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

@Injectable()
export class DoctorPhotoService {
  private readonly directory = process.env.DOCTOR_PHOTO_DIR
    ? resolve(process.env.DOCTOR_PHOTO_DIR)
    : resolve(__dirname, '../../../../../storage/doctor-photos');

  async save(doctorId: number, photo?: DoctorPhotoUpload) {
    if (!photo) throw new AppException(400, ErrorCode.VALIDATION_ERROR, 'Vui lòng chọn ảnh bác sĩ.');
    const extension = extensions[photo.mimetype];
    if (!extension) throw new AppException(400, ErrorCode.VALIDATION_ERROR, 'Ảnh phải có định dạng JPG, PNG hoặc WEBP.');
    if (photo.size > 10 * 1024 * 1024) throw new AppException(400, ErrorCode.VALIDATION_ERROR, 'Ảnh bác sĩ không được vượt quá 10 MB.');

    await mkdir(this.directory, { recursive: true });
    await this.remove(doctorId);
    const filename = `${doctorId}.${extension}`;
    await writeFile(join(this.directory, filename), photo.buffer);
    return { filename };
  }

  async open(doctorId: number) {
    const filename = await this.find(doctorId);
    if (!filename) throw new AppException(404, ErrorCode.DOCTOR_NOT_FOUND, 'Bác sĩ chưa có ảnh đại diện.');
    const extension = extname(filename).slice(1);
    const contentType = extension === 'jpg' ? 'image/jpeg' : `image/${extension}`;
    return new StreamableFile(createReadStream(join(this.directory, filename)), { type: contentType, disposition: 'inline' });
  }

  async remove(doctorId: number) {
    const filename = await this.find(doctorId);
    if (filename) await rm(join(this.directory, filename), { force: true });
  }

  private async find(doctorId: number) {
    try {
      const files = await readdir(this.directory);
      return files.find((filename) => filename.startsWith(`${doctorId}.`) && Object.values(extensions).includes(extname(filename).slice(1))) || null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
}
