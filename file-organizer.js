import { Command } from 'commander';
import Scanner from './lib/scanner.js';
import DuplicateFinder from './lib/duplicates.js';
import Organizer from './lib/organizer.js';
import Cleanup from './lib/cleanup.js';

function drawProgressBar(current, total, width = 20) {
  const percentage = total === 0 ? 0 : current / total;
  const filled = Math.round(percentage * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  return `${bar} ${current}/${total}`;
}

const program = new Command();

program
  .name('file-organizer')
  .description('CLI tool to organize files')
  .version('1.0.0');

program
  .command('scan <directory>')
  .description('Scan directory and show statistics')
  .action(async (directory) => {
    const scanner = new Scanner();
    let processedFiles = 0;

    scanner.on('scan-start', (data) => {
      console.log(`\n📂 Scanning: ${data.directory}`);
    });

    scanner.on('file-found', () => {
      processedFiles++;
      process.stdout.write(`\rProcessing... ${processedFiles} files found`);
    });

    scanner.on('scan-complete', (data) => {
      console.log(`\rProcessing... ████████████████████ ${processedFiles}/${processedFiles} files`);
      console.log('\n📊 Scan Results:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`Total files: ${data.totalFiles}`);
      console.log(`Total size: ${formatSize(data.totalSize)}`);
      
      console.log('\nBy File Type:');
      for (const [ext, info] of data.extensions) {
        console.log(`  ${ext || '(other)'}\t${info.count} files\t${formatSize(info.totalSize)}`);
      }

      console.log('\nFile Age:');
      console.log(`  Last 7 days:    ${data.age.last7} files`);
      console.log(`  Last 30 days:   ${data.age.last30} files`);
      console.log(`  Older than 90:  ${data.age.older90} files`);

      console.log('\nLargest files:');
      data.largestFiles.forEach((f, i) => {
        console.log(`  ${i + 1}. ${f.name}\t${formatSize(f.size)}`);
      });

      if (data.oldestFile) {
        console.log(`\nOldest file: ${data.oldestFile.name} (modified ${data.oldestFile.daysOld} days ago)`);
      }
    });

    await scanner.scan(directory);
  });

program
  .command('duplicates <directory>')
  .description('Find duplicate files')
  .action(async (directory) => {
    const finder = new DuplicateFinder();
    
    finder.on('scan-start', (data) => {
      console.log(`\n🔍 Searching for duplicates in: ${data.directory}`);
    });

    finder.on('file-processed', (data) => {
      process.stdout.write(`\rCalculating hashes... ${drawProgressBar(data.current, data.total)} files`);
    });

    finder.on('duplicates-found', (data) => {
      console.log(`\n\nFound ${data.groups.length} duplicate groups (${formatSize(data.totalWasted)} wasted):\n`);
      
      data.groups.forEach((group, index) => {
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`Group ${index + 1} (${group.copies} copies, ${formatSize(group.size)} each):`);
        console.log(`  SHA-256: ${group.hash.substring(0, 12)}...`);
        console.log('');
        group.paths.forEach(p => console.log(`  📄 ${p}`));
        console.log(`\n  Wasted space: ${formatSize(group.wasted)}`);
        console.log('');
      });

      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`💾 Total wasted space: ${formatSize(data.totalWasted)}`);
    });

    await finder.find(directory);
  });

program
  .command('organize <directory>')
  .description('Organize files into categories')
  .requiredOption('-o, --output <target>', 'Target directory')
  .action(async (directory, options) => {
    const organizer = new Organizer();
    
    organizer.on('organize-start', (data) => {
      console.log(`\n📦 Organizing: ${data.source}`);
      console.log(`Target: ${data.target}\n`);
      console.log('Creating folders...');
    });

    organizer.on('folder-created', (data) => {
      console.log(`  ✓ ${data.category}/`);
    });

    organizer.on('copy-progress', (data) => {
      process.stdout.write(`\rCopying files... ${drawProgressBar(data.current, data.total)}`);
    });

    organizer.on('organize-complete', (data) => {
      console.log('\n\n✅ Organization complete!\n');
      console.log('Summary:');
      
      for (const [category, count] of Object.entries(data.summary)) {
        console.log(`  ${category}: ${count} files → ${options.output}/${category}/`);
      }
      
      console.log(`\nTotal copied: ${data.totalFiles} files (${formatSize(data.totalSize)})`);
    });

    await organizer.organize(directory, options.output);
  });

program
  .command('cleanup <directory>')
  .description('Find and remove old files')
  .requiredOption('--older-than <days>', 'File age threshold in days', parseInt)
  .option('--confirm', 'Actually delete the files')
  .action(async (directory, options) => {
    const cleanup = new Cleanup();
    
    cleanup.on('cleanup-start', (data) => {
      console.log(`\n🧹 Cleanup: ${data.directory}`);
      console.log(`Looking for files older than ${options.olderThan} days...\n`);
    });

    cleanup.on('files-found', (data) => {
      console.log(`Found ${data.files.length} files to delete:\n`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      data.files.forEach(f => {
        console.log(`${f.name}`);
        console.log(`  Size: ${formatSize(f.size)}`);
        console.log(`  Modified: ${f.daysOld} days ago\n`);
      });
      
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`\nTotal: ${data.files.length} files (${formatSize(data.totalSize)})\n`);
      
      if (!options.confirm) {
        console.log('⚠️  DRY RUN MODE: No files were deleted.');
        console.log('To actually delete these files, run with --confirm flag.');
      } else {
        console.log(`⚠️  DELETING ${data.files.length} files (${formatSize(data.totalSize)}). This action cannot be undone!\n`);
      }
    });

    cleanup.on('delete-progress', (data) => {
      process.stdout.write(`\rDeleting... ${drawProgressBar(data.current, data.total)}`);
    });

    cleanup.on('cleanup-complete', (data) => {
      if (options.confirm) {
        console.log('\n\n✅ Cleanup complete!');
        console.log(`Deleted: ${data.deletedFiles} files (${formatSize(data.freedSize)} freed)`);
      }
    });

    await cleanup.run(directory, options.olderThan, options.confirm);
  });

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
}

program.parse();