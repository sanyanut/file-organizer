import { EventEmitter } from 'events';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

const categories = {
  Documents: ['.pdf', '.docx', '.doc', '.txt', '.md', '.xlsx', '.pptx'],
  Images: ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp'],
  Archives: ['.zip', '.rar', '.tar', '.gz', '.7z'],
  Code: ['.js', '.py', '.java', '.cpp', '.html', '.css', '.json'],
  Videos: ['.mp4', '.avi', '.mkv', '.mov', '.webm'],
  Other: []
};

function getCategory(ext) {
  for (const [category, extensions] of Object.entries(categories)) {
    if (extensions.includes(ext.toLowerCase())) {
      return category;
    }
  }
  return 'Other';
}

async function getUniquePath(targetPath) {
  let uniquePath = targetPath;
  let counter = 1;
  const parsed = path.parse(targetPath);
  
  while (true) {
    try {
      await fsp.access(uniquePath);
      uniquePath = path.join(parsed.dir, `${parsed.name}(${counter})${parsed.ext}`);
      counter++;
    } catch (e) {
      // File does not exist — this path is free to use
      break;
    }
  }
  return uniquePath;
}

export default class Organizer extends EventEmitter {
  constructor() {
    super();
  }

  async organize(sourceDirectory, targetDirectory) {
    this.emit('organize-start', { source: sourceDirectory, target: targetDirectory });

    for (const category of Object.keys(categories)) {
      const categoryPath = path.join(targetDirectory, category);
      await fsp.mkdir(categoryPath, { recursive: true });
      this.emit('folder-created', { category });
    }

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

    const allFiles = await walk(sourceDirectory);
    let processed = 0;
    let totalSizeCopied = 0;
    const summary = {
      Documents: 0,
      Images: 0,
      Archives: 0,
      Code: 0,
      Videos: 0,
      Other: 0
    };

    for (const filePath of allFiles) {
      try {
        const stats = await fsp.stat(filePath);
        const ext = path.extname(filePath);
        const category = getCategory(ext);
        
        const fileName = path.basename(filePath);
        const initialTargetPath = path.join(targetDirectory, category, fileName);
        const targetPath = await getUniquePath(initialTargetPath);

        this.emit('copy-start', { file: filePath });

        const tenMB = 10 * 1024 * 1024;
        if (stats.size < tenMB) {
          await fsp.copyFile(filePath, targetPath);
        } else {
          await pipeline(
            fs.createReadStream(filePath),
            fs.createWriteStream(targetPath)
          );
        }

        totalSizeCopied += stats.size;
        summary[category]++;
        this.emit('copy-complete', { file: filePath });
      } catch (error) {
        this.emit('copy-error', { file: filePath, error });
      }
      
      processed++;
      this.emit('copy-progress', { current: processed, total: allFiles.length });
    }

    this.emit('organize-complete', {
      summary,
      totalFiles: allFiles.length,
      totalSize: totalSizeCopied
    });

    return { summary, totalFiles: allFiles.length, totalSize: totalSizeCopied };
  }
}
