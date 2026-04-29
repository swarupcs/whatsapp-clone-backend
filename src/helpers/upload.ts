/**
 * upload.ts — Multer + ImageKit integration.
 *
 * Files are buffered in memory by multer (no disk writes) and then pushed
 * directly to ImageKit via the @imagekit/nodejs SDK.
 *
 * Usage in a route handler:
 *   router.post('/', upload.array('files', 10), messageController.send);
 *
 * After the route handler runs, req.files contains Express.Multer.File[]
 * objects where file.buffer holds the raw bytes. Call `multerFileToAttachment`
 * (which internally calls ImageKit) to get back a FileAttachment DTO with an
 * ImageKit CDN URL.
 */

import multer, { type FileFilterCallback } from 'multer';
import { v4 as uuidv4 } from 'uuid';
import type { Request } from 'express';
import { env } from '../config/env.js';
import { uploadToImageKit } from '../services/imagekit.service.js';

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

// ─── File filter ──────────────────────────────────────────────────────────────

function fileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback,
): void {
  if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type "${file.mimetype}" is not allowed`));
  }
}

// ─── Multer instance (memory storage — no disk I/O) ──────────────────────────

export const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: {
    fileSize: env.upload.maxFileSizeMb * 1024 * 1024,
    files: 10,
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Determines the ImageKit folder based on MIME type.
 */
function folderForMime(mimeType: string): string {
  if (mimeType.startsWith('image/')) return '/swiftchat/images';
  if (mimeType.startsWith('video/')) return '/swiftchat/videos';
  if (mimeType.startsWith('audio/')) return '/swiftchat/audio';
  return '/swiftchat/documents';
}

/**
 * Converts a multer in-memory file to a FileAttachment DTO by uploading it
 * to ImageKit. Returns the ImageKit CDN URL (not a localhost path).
 *
 * NOTE: This is async because it performs an HTTP upload to ImageKit.
 */
export async function multerFileToAttachment(file: Express.Multer.File) {
  const folder = folderForMime(file.mimetype);
  const uploaded = await uploadToImageKit(
    file.buffer,
    file.mimetype,
    file.originalname,
    folder,
  );

  return {
    id: uploaded.fileId || uuidv4(),
    name: file.originalname,
    type: file.mimetype,
    url: uploaded.url,
    size: file.size,
  };
}

/**
 * Upload a single avatar/picture buffer to the ImageKit avatars folder.
 * Returns the public CDN URL.
 */
export async function uploadAvatar(
  buffer: Buffer,
  mimeType: string,
  originalName: string,
): Promise<string> {
  const result = await uploadToImageKit(
    buffer,
    mimeType,
    originalName,
    '/swiftchat/avatars',
  );
  return result.url;
}
