/**
 * Rm Command Handler - Remove instances from A-box
 */

import { loadAll, getStoragePath } from '../../core/loader.js';
import { safeWrite } from '../../core/safe-write.js';
import { join } from 'path';
import yaml from 'js-yaml';

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

    for (const id of ids) {
      let foundInstance = false;
      
      // Search instance A-box across all classes
      for (const className in data.instances.classes || {}) {
        const instances = data.instances.classes[className];
        if (Array.isArray(instances)) {
          for (const inst of instances) {
            if (inst.id === id) {
              found.push(id);
              foundInstance = true;
              break;
            }
          }
        }
        if (foundInstance) break;
      }

      if (!foundInstance) {
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

    // Collect affected files
    const affectedFiles = new Set();

    for (const rawDoc of data.rawDocuments || []) {
      const doc = rawDoc.document;
      
      // Check A-box (instances) in this document
      if (doc.instances) {
        for (const className in doc.instances) {
          if (Array.isArray(doc.instances[className])) {
            const instances = doc.instances[className];
            const before = instances.length;
            
            // Remove by filtering
            doc.instances[className] = instances.filter(inst => !ids.includes(inst.id));
            
            if (doc.instances[className].length < before) {
              affectedFiles.add(rawDoc.source);
            }
          }
        }
      }
    }

    if (affectedFiles.size === 0) {
      throw new Error('No instances found to remove');
    }

    // Write back affected files
    const storagePath = getStoragePath();
    for (const source of affectedFiles) {
      const doc = data.rawDocuments.find(d => d.source === source);
      if (doc) {
        const filePath = join(storagePath, '..', source);
        const newContent = yaml.dump(doc.document, { lineWidth: -1, noRefs: true });
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
