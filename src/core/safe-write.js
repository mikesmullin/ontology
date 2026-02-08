/**
 * Safe Write - Write file with validation rollback
 * 
 * Saves original content before writing, validates after write,
 * and rolls back if validation fails.
 */

import { readFile, writeFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { loadAll } from './loader.js';
import { validate } from './validator.js';

/**
 * Write content to a file, validate, and rollback on failure.
 * 
 * @param {string} filePath - Path to write to
 * @param {string} newContent - New file content
 * @param {Object} [options] - Options
 * @param {boolean} [options.isNew] - If true, file doesn't exist yet; rollback deletes it
 * @returns {Promise<{ valid: boolean, errors: Array }>}
 */
export async function safeWrite(filePath, newContent, options = {}) {
  const { isNew = false } = options;
  
  // Save original content for rollback (if file exists)
  let originalContent = null;
  if (!isNew && existsSync(filePath)) {
    originalContent = await readFile(filePath, 'utf-8');
  }
  
  // Write new content
  await writeFile(filePath, newContent, 'utf-8');
  
  // Validate
  const data = await loadAll();
  const result = validate(data);
  
  if (!result.valid) {
    // Rollback
    if (isNew) {
      await unlink(filePath);
    } else if (originalContent !== null) {
      await writeFile(filePath, originalContent, 'utf-8');
    }
    return { valid: false, errors: result.errors };
  }
  
  return { valid: true, errors: [] };
}
