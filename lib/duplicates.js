import { EventEmitter } from 'events';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

function calculateHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

export default class DuplicateFinder extends EventEmitter {
  constructor() {
    super();
  }

  async find(directory) {
    this.emit('scan-start', { directory });

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
    const hashes = new Map();

    let processed = 0;
    for (const filePath of allFiles) {
      try {
        const hash = await calculateHash(filePath);
        if (!hashes.has(hash)) {
          hashes.set(hash, []);
        }
        hashes.get(hash).push(filePath);
      } catch (error) {
        console.error(error);
      }
      processed++;
      this.emit('file-processed', { current: processed, total: allFiles.length });
    }

    const duplicateGroups = [];
    let totalWastedSpace = 0;

    for (const [hash, filePaths] of hashes.entries()) {
      if (filePaths.length > 1) {
        let fileSize = 0;
        try {
          const stats = await fsp.stat(filePaths[0]);
          fileSize = stats.size;
        } catch (error) {
          console.error(error);
          continue;
        }

        const wasted = fileSize * (filePaths.length - 1);
        totalWastedSpace += wasted;

        duplicateGroups.push({
          hash,
          paths: filePaths,
          copies: filePaths.length,
          size: fileSize,
          wasted
        });
      }
    }

    this.emit('duplicates-found', {
      groups: duplicateGroups,
      totalWasted: totalWastedSpace
    });

    return { groups: duplicateGroups, totalWasted: totalWastedSpace };
  }
}
