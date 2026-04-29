import cron from 'node-cron';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { Message } from '../models/message.model.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { deleteFromImageKit } from './imagekit.service.js';

/**
 * Periodically deletes physical files for messages that have been marked 
 * as deleted for more than 30 days.
 */
export function initCleanupJob() {
  // Run every day at midnight
  cron.schedule('0 0 * * *', async () => {
    logger.info('[Cleanup] Starting orphaned files cleanup job...');
    
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Find messages that are deleted, have files, and were deleted more than 30 days ago
      const messagesWithOrphanedFiles = await Message.find({
        isDeleted: true,
        deletedAt: { $lte: thirtyDaysAgo },
        'files.0': { $exists: true }
      });

      if (messagesWithOrphanedFiles.length === 0) {
        logger.info('[Cleanup] No orphaned files to clean up.');
        return;
      }

      let deletedCount = 0;

      for (const msg of messagesWithOrphanedFiles) {
        if (!msg.files || msg.files.length === 0) continue;

        for (const file of msg.files) {
          try {
            if (file.attachmentId && !file.url.includes('/uploads/')) {
              await deleteFromImageKit(file.attachmentId);
              deletedCount++;
            } else if (file.url.includes('/uploads/')) {              // Fallback for legacy local files
              const uploadDir = path.resolve(process.cwd(), env.upload.uploadDir);
              const urlPath = new URL(file.url, 'http://localhost').pathname;
              const filename = path.basename(urlPath);
              const filePath = path.join(uploadDir, filename);

              if (existsSync(filePath)) {
                await fs.unlink(filePath);
                deletedCount++;
              }
            }
          } catch (err) {
            logger.error(`[Cleanup] Failed to delete file for message ${msg._id}:`, {
              error: err instanceof Error ? err.message : String(err)
            });
          }
        }

        // Clear files array in DB to avoid repeated attempts
        msg.files = [];
        await msg.save();
      }

      logger.info(`[Cleanup] Successfully deleted ${deletedCount} physical files.`);
    } catch (err) {
      logger.error('[Cleanup] Error in cleanup job:', {
        error: err instanceof Error ? err.message : String(err)
      });
    }
  });

  logger.info('[Cleanup] Orphaned files cleanup job scheduled (daily at midnight).');
}
