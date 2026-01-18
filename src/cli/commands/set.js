/**
 * Set Command Handler - Set property values on instances (A-box)
 */

import { loadAll, getStoragePath } from '../../core/loader.js';
import { validate } from '../../core/validator.js';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import yaml from 'js-yaml';

/**
 * Show set command help
 */
function showHelp() {
  console.log(`
ontology set - Set property values on an instance (A-box)

Usage:
  ontology set <id>:<class> <key>=<value> [<key>=<value> ...]

Arguments:
  <id>:<class>       Instance identifier (e.g., jdoe:Person)
  <key>=<value>      Property assignments (e.g., name="John Doe")

Options:
  --help             Show this help message
  --verbose          Show detailed output
  --quiet            Suppress output except errors

Description:
  Sets one or more property values on an existing class instance.
  Values are validated against the schema if the property is defined.

Examples:
  ontology set jdoe:Person name="John Doe"
  ontology set jdoe:Person email="jdoe@company.com" active=true
  ontology set team-zulu:Team name="Team Zulu" description="The Z team"
`);
}

/**
 * Parse instance identifier (id:class format)
 * @param {string} identifier
 * @returns {{ id: string, className: string }}
 */
function parseIdentifier(identifier) {
  const match = identifier.match(/^([^:]+):(.+)$/);
  if (!match) {
    throw new Error(`Invalid identifier format '${identifier}'. Use format: id:Class`);
  }
  return { id: match[1], className: match[2] };
}

/**
 * Parse property assignment (key=value format)
 * @param {string} assignment
 * @returns {{ key: string, value: any }}
 */
function parseAssignment(assignment) {
  const match = assignment.match(/^([^=]+)=(.*)$/);
  if (!match) {
    throw new Error(`Invalid assignment format '${assignment}'. Use format: key=value`);
  }
  
  const key = match[1];
  let value = match[2];
  
  // Remove surrounding quotes if present
  if ((value.startsWith('"') && value.endsWith('"')) || 
      (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  
  // Try to parse as boolean or number
  if (value === 'true') {
    return { key, value: true };
  } else if (value === 'false') {
    return { key, value: false };
  } else if (!isNaN(Number(value)) && value !== '') {
    return { key, value: Number(value) };
  }
  
  return { key, value };
}

/**
 * Find the file containing an instance
 * @param {string} id
 * @param {Object} data
 * @returns {string | null}
 */
function findInstanceFile(id, data) {
  const instance = data.instances.classes.find(i => i._id === id);
  if (!instance) {
    return null;
  }
  return instance._source;
}

/**
 * Handle the set command
 * @param {string[]} args
 */
export async function handleSet(args) {
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    showHelp();
    return;
  }
  
  const options = {
    verbose: args.includes('--verbose'),
    quiet: args.includes('--quiet') || args.includes('-q')
  };
  
  // Filter out flags
  const cleanArgs = args.filter(a => !a.startsWith('-'));
  
  if (cleanArgs.length < 2) {
    console.error('Error: Set command requires at least 2 arguments.');
    console.error('Usage: ontology set <id>:<class> <key>=<value> [...]');
    process.exit(1);
  }
  
  const [identifierArg, ...assignmentArgs] = cleanArgs;
  
  let id, className;
  try {
    ({ id, className } = parseIdentifier(identifierArg));
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
  
  // Parse assignments
  const assignments = {};
  for (const assignArg of assignmentArgs) {
    try {
      const { key, value } = parseAssignment(assignArg);
      assignments[key] = value;
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  }
  
  if (Object.keys(assignments).length === 0) {
    console.error('Error: At least one property assignment required.');
    process.exit(1);
  }
  
  // Load existing data
  const data = await loadAll();
  
  // Check if instance exists
  const existingInstance = data.instances.classes.find(i => i._id === id);
  if (!existingInstance) {
    console.error(`Error: Instance '${id}' not found.`);
    console.error(`Hint: Run 'ontology new ${id}:${className}' first.`);
    process.exit(1);
  }
  
  // Verify class matches
  if (existingInstance._class !== className) {
    console.error(`Error: Instance '${id}' is of class '${existingInstance._class}', not '${className}'.`);
    process.exit(1);
  }
  
  // Find the source file
  const sourceFile = findInstanceFile(id, data);
  if (!sourceFile) {
    console.error(`Error: Could not find file for instance '${id}'.`);
    process.exit(1);
  }
  
  // Load and update the source file
  const storagePath = getStoragePath();
  const filePath = join(storagePath, '..', sourceFile);
  const content = await readFile(filePath, 'utf-8');
  
  // Parse all documents in the file
  const docs = yaml.loadAll(content);
  let updated = false;
  
  for (let i = 0; i < docs.length; i++) {
    const parsed = docs[i];
    if (parsed?.spec?.classes) {
      // Find the instance in this document
      const instances = parsed.spec.classes;
      for (let j = 0; j < instances.length; j++) {
        if (instances[j]._id === id) {
          // Update properties
          Object.assign(instances[j], assignments);
          updated = true;
          break;
        }
      }
      if (updated) break;
    }
  }
  
  if (!updated) {
    console.error(`Error: Could not find instance '${id}' in '${sourceFile}'.`);
    process.exit(1);
  }
  
  // Write back (multi-document)
  const newContent = docs.map(d => yaml.dump(d, { lineWidth: -1, noRefs: true })).join('---\n');
  await writeFile(filePath, newContent, 'utf-8');
  
  // Validate
  const newData = await loadAll();
  const result = validate(newData);
  
  if (!result.valid) {
    console.error('Validation failed after setting properties:');
    for (const err of result.errors) {
      console.error(`  ✗ ${err.message}`);
    }
    process.exit(1);
  }
  
  if (!options.quiet) {
    const propsStr = Object.entries(assignments)
      .map(([k, v]) => `${k}=${typeof v === 'string' ? `"${v}"` : v}`)
      .join(', ');
    console.log(`Set ${className}:${id} ${propsStr}`);
  }
}
