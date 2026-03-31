import multer, { type FileFilterCallback } from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import type { Request } from 'express';
import { env } from '../config/env.js';

// ─── Allowed MIME types ───────────────────────────────────────────────────────

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'video/mp4', 'video/webm', 'video/mpeg', 'video/quicktime',
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/x-rar-compressed',
  'application/x-7z-compressed',
]);

// ─── Ensure upload directory exists ──────────────────────────────────────────

const UPLOAD_DIR = path.resolve(process.cwd(), env.upload.uploadDir);
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// ─── Storage engine ───────────────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination(_req, _file, cb) { cb(null, UPLOAD_DIR); },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

// ─── File filter ──────────────────────────────────────────────────────────────

function fileFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void {
  if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type "${file.mimetype}" is not allowed`));
  }
}

// ─── Multer instance ──────────────────────────────────────────────────────────

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: env.upload.maxFileSizeMb * 1024 * 1024, files: 10 },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function buildFileUrl(filename: string, baseUrl: string): string {
  return `${baseUrl}/uploads/${filename}`;
}

export function deleteUploadedFile(filename: string): void {
  const filePath = path.join(UPLOAD_DIR, filename);
  fs.unlink(filePath, (err) => {
    if (err && err.code !== 'ENOENT') {
      console.error(`[Upload] Failed to delete file ${filename}:`, err.message);
    }
  });
}

export function multerFileToAttachment(file: Express.Multer.File, baseUrl: string) {
  return {
    id: uuidv4(),
    name: file.originalname,
    type: file.mimetype,
    url: buildFileUrl(file.filename, baseUrl),
    size: file.size,
  };
}
