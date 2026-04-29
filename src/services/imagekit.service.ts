/**
 * imagekit.service.ts
 *
 * Thin wrapper around the @imagekit/nodejs SDK (v7+).
 * Provides `uploadToImageKit` and `deleteFromImageKit` helpers used by the
 * upload middleware and the avatar / group-picture endpoints.
 *
 * Folder layout in ImageKit:
 *   /swiftchat/images/    — image message attachments
 *   /swiftchat/videos/    — video message attachments
 *   /swiftchat/audio/     — audio/voice message attachments
 *   /swiftchat/documents/ — document attachments
 *   /swiftchat/avatars/   — user & group profile pictures
 *
 * SDK notes (v7):
 *  - ClientOptions only takes `privateKey` (not publicKey/urlEndpoint).
 *  - Upload: `imagekit.files.upload({ file, fileName, ... })`.
 *    `file` must be `Uploadable | string`. Buffer is an ArrayBufferView, so
 *    we wrap it with `toFile()` first.
 *  - Delete: `imagekit.files.delete(fileId)`.
 *  - All response fields are optional (`string | undefined`), so we use
 *    non-null assertions after checking the result is truthy.
 */

import ImageKit from '@imagekit/nodejs';
import { toFile } from '@imagekit/nodejs/core/uploads';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env.js';

// ─── SDK instance ─────────────────────────────────────────────────────────────

const imagekit = new ImageKit({
  privateKey: env.imagekit.privateKey,
});

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UploadResult {
  /** Full CDN URL of the uploaded file */
  url: string;
  /** ImageKit file ID (used for deletion) */
  fileId: string;
  /** File name inside ImageKit */
  name: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Upload a buffer (from multer's memory storage) to ImageKit.
 *
 * @param buffer       Raw file bytes
 * @param mimeType     MIME type string (e.g. "image/jpeg")
 * @param originalName Original file name from the client
 * @param folder       ImageKit folder path (e.g. "/swiftchat/images")
 */
export async function uploadToImageKit(
  buffer: Buffer,
  mimeType: string,
  originalName: string,
  folder: string = '/swiftchat/messages',
): Promise<UploadResult> {
  const ext = originalName.includes('.')
    ? originalName.split('.').pop()!
    : (mimeType.split('/')[1] ?? 'bin');
  const uniqueName = `${uuidv4()}.${ext}`;

  // Convert Buffer → File object accepted by the SDK
  const uploadable = await toFile(buffer, uniqueName, { type: mimeType });

  const result = await imagekit.files.upload({
    file: uploadable,
    fileName: uniqueName,
    folder,
    useUniqueFileName: false,
    tags: [folder.replace(/\//g, '_').replace(/^_/, '')],
  });

  return {
    url: result.url ?? '',
    fileId: result.fileId ?? '',
    name: result.name ?? uniqueName,
  };
}

/**
 * Delete a file from ImageKit by its fileId.
 * Safe to call with an empty / undefined fileId — it will be a no-op.
 */
export async function deleteFromImageKit(fileId: string | undefined): Promise<void> {
  if (!fileId) return;
  try {
    await imagekit.files.delete(fileId);
  } catch (err) {
    console.error(`[ImageKit] Failed to delete file ${fileId}:`, err);
  }
}

export { imagekit };
