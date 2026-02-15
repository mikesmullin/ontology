/**
 * Rm Command Handler - Remove instances from A-box
 */

import { loadAll, getStoragePath } from '../../core/loader.js';
import { safeWrite } from '../../core/safe-write.js';
import { readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { parseStorageFileContent, serializeStorageFileContent } from '../../core/storage-file.js';

/**
 * Show rm command help
 */
function showHelp() {
  console.log(`
ontology rm - Remove instances (A-box)

Usage:
  ontology rm <id> [<id> ...] [options]

Options:
  --help            Show this help message
  --force, -f       Force removal without confirmation
  --verbose, -v     Show detailed output
  --quiet, -q       Suppress output except errors

Examples:
  # Remove instances by ID
  ontology rm instance1                   # Remove single instance
  ontology rm instance1 instance2         # Remove multiple instances
  ontology rm :Service:web-api1 --force   # Force remove with colon-prefixed ID
  ontology rm --help                      # Show this help
`);
}

/**
 * Handle the rm command
 * @param {string[]} args
 */
export async function handleRm(args) {
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    showHelp();
    return;
  }

  const options = {
    force: args.includes('--force') || args.includes('-f'),
    verbose: args.includes('--verbose') || args.includes('-v'),
    quiet: args.includes('--quiet') || args.includes('-q')
  };

  const ids = args.filter(a => !a.startsWith('-')).map(id => {
    // Remove leading colons
    return id.startsWith(':') ? id.slice(1) : id;
  });

  if (ids.length === 0) {
    throw new Error('rm requires at least one instance ID');
  }

  try {
    const data = await loadAll();

    // Find which instances exist
    const found = [];
    const notFound = [];

    const existingIdSet = new Set((data.instances.classes || []).map(i => i._id));

    for (const id of ids) {
      if (existingIdSet.has(id)) {
        found.push(id);
      } else {
        notFound.push(id);
      }
    }

    // Warn about not found
    if (notFound.length > 0 && !options.quiet) {
      console.log(`Warning: ${notFound.length} instance(s) not found:`);
      for (const id of notFound) {
        console.log(`  - ${id}`);
      }
    }

    if (found.length === 0) {
      throw new Error('No instances found to remove');
    }

    const affectedFiles = new Set(found.map(id => {
      const instance = data.instances.classes.find(i => i._id === id);
      return instance?._source;
    }).filter(Boolean));

    if (affectedFiles.size === 0) {
      throw new Error('No instances found to remove');
    }

    // Write back affected files
    const storagePath = getStoragePath();
    for (const source of affectedFiles) {
      const filePath = join(storagePath, '..', source);
      const content = await readFile(filePath, 'utf-8');
      const { docs, body } = parseStorageFileContent(filePath, content);

      let removedInFile = 0;
      for (const doc of docs) {
        const classList = doc?.spec?.classes;
        if (!Array.isArray(classList)) continue;

        const beforeCount = classList.length;
        doc.spec.classes = classList.filter(inst => !ids.includes(inst?._id));
        removedInFile += (beforeCount - doc.spec.classes.length);
      }

      if (removedInFile === 0) continue;

      const hasRemainingDocs = docs.some(doc => {
        if (doc?.schema) return true;
        if (Array.isArray(doc?.spec?.classes) && doc.spec.classes.length > 0) return true;
        return false;
      });

      if (!hasRemainingDocs) {
        await unlink(filePath);
        if (options.verbose) {
          console.log(`Deleted empty file: ${source}`);
        }
        continue;
      }

      const newContent = serializeStorageFileContent(filePath, docs, { body });
      const result = await safeWrite(filePath, newContent);

      if (!result.valid) {
        console.error(`Validation failed for ${source}:`);
        for (const err of result.errors) {
          console.error(`  ✗ ${err.message}`);
        }
        process.exit(1);
      }

      if (options.verbose) {
        console.log(`Updated: ${source}`);
      }
    }

    if (!options.quiet) {
      console.log(`Removed ${found.length} instance(s) from ${affectedFiles.size} file(s)`);
      for (const id of found) {
        console.log(`  ✓ ${id}`);
      }
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}
