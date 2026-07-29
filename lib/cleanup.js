import { EventEmitter } from 'events';
import fsp from 'node:fs/promises';
import path from 'node:path';

export default class Cleanup extends EventEmitter {
  constructor() {
    super();
  }

  async run(directory, olderThanDays, confirmDelete) {
    this.emit('cleanup-start', { directory, olderThanDays });

    async function walk(dir) {
      let files = [];
      try {
        const items = await fsp.readdir(dir, { withFileTypes: true });
        for (const item of items) {
          const fullPath = path.join(dir, item.name);
          if (item.isDirectory()) {
            files = files.concat(await walk(fullPath));
          } else if (item.isFile()) {
            files.push(fullPath);
          }
        }
      } catch (error) {
        if (error.code === 'ENOENT') {
          console.error(`\n❌ Error: Directory not found: ${dir}`);
        } else if (error.code === 'EACCES') {
          console.error(`\n❌ Error: Permission denied: ${dir}`);
        } else {
          console.error(`\n❌ Unexpected error: ${error.message}`);
        }
        process.exit(1);
      }
      return files;
    }

    const allFiles = await walk(directory);
    const filesToDelete = [];
    let totalSizeToFree = 0;

    const now = Date.now();
    const dayInMs = 1000 * 60 * 60 * 24;

    for (const filePath of allFiles) {
      try {
        const stats = await fsp.stat(filePath);
        const daysOld = Math.floor((now - stats.mtime.getTime()) / dayInMs);

        if (daysOld > olderThanDays) {
          filesToDelete.push({
            name: path.basename(filePath),
            path: filePath,
            size: stats.size,
            daysOld
          });
          totalSizeToFree += stats.size;
        }
      } catch (error) {
        console.error(`\n⚠️  Skipping file ${filePath}: ${error.message}`);
      }
    }

    this.emit('files-found', { files: filesToDelete, totalSize: totalSizeToFree });

    if (!confirmDelete) {
      return { dryRun: true, files: filesToDelete, totalSize: totalSizeToFree };
    }

    let deletedFiles = 0;
    let freedSize = 0;

    for (const file of filesToDelete) {
      try {
        await fsp.unlink(file.path);
        deletedFiles++;
        freedSize += file.size;
        this.emit('file-deleted', { file: file.path });
      } catch (error) {
        console.error(`\n⚠️  Could not delete ${file.path}: ${error.message}`);
      }
      this.emit('delete-progress', { current: deletedFiles, total: filesToDelete.length });
    }

    this.emit('cleanup-complete', {
      deletedFiles,
      freedSize
    });

    return { dryRun: false, deletedFiles, freedSize };
  }
}
