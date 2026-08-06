import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  Body,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomBytes } from 'crypto';
import { R2Service } from './r2.service';
import { AdminGuard } from '../auth/admin.guard';

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

@UseGuards(AdminGuard)
@Controller('uploads')
export class UploadsController {
  constructor(private readonly r2: R2Service) {}

  /**
   * List previously uploaded images for the admin picker.
   * GET /uploads/images?folder=cards — newest first (keys start with a timestamp).
   */
  @Get('images')
  async listImages(@Query('folder') folder?: string) {
    const safe = folder ? folder.toLowerCase().replace(/[^a-z0-9-]/g, '') : '';
    const files = await this.r2.listFiles(safe || undefined);
    files.sort((a, b) => (a.key < b.key ? 1 : -1));
    return { images: files };
  }

  /**
   * Admin image upload → Cloudflare R2 → returns the public CDN URL.
   * multipart/form-data: file=<image>, folder=products|cards (optional)
   */
  @Post('image')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 8 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (EXT_BY_MIME[file.mimetype]) return cb(null, true);
        cb(new BadRequestException('Only JPEG/PNG/WebP/GIF/AVIF images are allowed'), false);
      },
    }),
  )
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @Body('folder') folder?: string,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    const safeFolder = (folder || 'misc').toLowerCase().replace(/[^a-z0-9-]/g, '') || 'misc';
    const ext = EXT_BY_MIME[file.mimetype];
    const key = `${safeFolder}/${Date.now()}-${randomBytes(6).toString('hex')}.${ext}`;
    const url = await this.r2.uploadFile(file.buffer, key, file.mimetype);
    return { url, key };
  }
}
