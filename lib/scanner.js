import { EventEmitter } from 'events';
import fs from 'node:fs/promises';
import path from 'node:path';

export default class Scanner extends EventEmitter {
  constructor() {
    super();
  }

  async scan(directory) {
    this.emit('scan-start', { directory });

    const stats = {
      totalSize: 0,
      totalFiles: 0,
      extensions: new Map(),
      age: {
        last7: 0,
        last30: 0,
        older90: 0
      },
      largestFiles: [],
      oldestFile: null
    };

    const now = Date.now();
    const dayInMs = 1000 * 60 * 60 * 24;

    async function walk(dir) {
      let files = [];
      try {
        const items = await fs.readdir(dir, { withFileTypes: true });
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

    for (const filePath of allFiles) {
      try {
        const fileStats = await fs.stat(filePath);
        const size = fileStats.size;
        const mtime = fileStats.mtime.getTime();
        const ext = path.extname(filePath).toLowerCase();
        
        this.emit('file-found', { path: filePath, size, mtime });

        stats.totalFiles++;
        stats.totalSize += size;

        if (!stats.extensions.has(ext)) {
          stats.extensions.set(ext, { count: 0, totalSize: 0 });
        }
        const extInfo = stats.extensions.get(ext);
        extInfo.count++;
        extInfo.totalSize += size;

        const daysOld = Math.floor((now - mtime) / dayInMs);
        if (daysOld <= 7) stats.age.last7++;
        if (daysOld <= 30) stats.age.last30++;
        if (daysOld > 90) stats.age.older90++;

        stats.largestFiles.push({ name: path.basename(filePath), size });
        stats.largestFiles.sort((a, b) => b.size - a.size);
        if (stats.largestFiles.length > 3) {
          stats.largestFiles.pop();
        }

        if (!stats.oldestFile || daysOld > stats.oldestFile.daysOld) {
          stats.oldestFile = {
            name: path.basename(filePath),
            daysOld
          };
        }
      } catch (error) {
        console.error(error);
      }
    }

    stats.extensions = new Map([...stats.extensions.entries()].sort((a, b) => b[1].count - a[1].count));

    this.emit('scan-complete', stats);
    return stats;
  }
}
