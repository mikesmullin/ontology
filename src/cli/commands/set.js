/**
 * Set Command Handler - Set property values on instances (A-box)
 */

import { loadAll, getStoragePath } from '../../core/loader.js';
import { safeWrite } from '../../core/safe-write.js';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { parseStorageFileContent, serializeStorageFileContent } from '../../core/storage-file.js';

/**
 * Show set command help
 */
function showHelp() {
  console.log(`
ontology set - Set property values on an instance (A-box)

Usage:
  ontology set <id>:<class> <component>.<key>=<value> [...]

Arguments:
  <id>:<class>              Instance identifier (e.g., jdoe:Person)
  <component>.<key>=<value> Component property assignments (e.g., identity.name="John Doe")

Options:
  --help             Show this help message
  --verbose          Show detailed output
  --quiet            Suppress output except errors

Description:
  Sets one or more property values on an existing class instance.
  Properties must be specified with their component prefix.
  Values are validated against the component schema.

Examples:
  ontology set jdoe:Person identity.name="John Doe"
  ontology set jdoe:Person contact.email="jdoe@company.com" employment.active=true
  ontology set team-zulu:Team info.name="Team Zulu"
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
 * Parse property assignment (component.key=value format)
 * @param {string} assignment
 * @returns {{ component: string, key: string, value: any }}
 */
function parseAssignment(assignment) {
  const match = assignment.match(/^([^.]+)\.([^=]+)=(.*)$/);
  if (!match) {
    throw new Error(`Invalid assignment format '${assignment}'. Use format: component.key=value`);
  }
  
  const component = match[1];
  const key = match[2];
  let value = match[3];
  
  // Remove surrounding quotes if present
  if ((value.startsWith('"') && value.endsWith('"')) || 
      (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  
  // Check for array syntax: [val1, val2, val3] or [val1,val2,val3]
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    if (inner === '') {
      return { component, key, value: [] };
    }
    const items = inner.split(',').map(item => {
      item = item.trim();
      // Strip quotes from individual items
      if ((item.startsWith('"') && item.endsWith('"')) || 
          (item.startsWith("'") && item.endsWith("'"))) {
        item = item.slice(1, -1);
      }
      return item;
    });
    return { component, key, value: items };
  }
  
  // Try to parse as boolean or number
  if (value === 'true') {
    return { component, key, value: true };
  } else if (value === 'false') {
    return { component, key, value: false };
  } else if (!isNaN(Number(value)) && value !== '') {
    return { component, key, value: Number(value) };
  }
  
  return { component, key, value };
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
  
  // Parse assignments - group by component
  const componentAssignments = {};
  for (const assignArg of assignmentArgs) {
    try {
      const { component, key, value } = parseAssignment(assignArg);
      if (!componentAssignments[component]) {
        componentAssignments[component] = {};
      }
      componentAssignments[component][key] = value;
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  }
  
  if (Object.keys(componentAssignments).length === 0) {
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
  const { docs, body } = parseStorageFileContent(filePath, content);
  let updated = false;
  
  for (let i = 0; i < docs.length; i++) {
    const parsed = docs[i];
    if (parsed?.spec?.classes) {
      // Find the instance in this document
      const instances = parsed.spec.classes;
      for (let j = 0; j < instances.length; j++) {
        if (instances[j]._id === id) {
          // Initialize components if not present
          if (!instances[j].components) {
            instances[j].components = {};
          }
          // Update component properties
          for (const [componentName, props] of Object.entries(componentAssignments)) {
            if (!instances[j].components[componentName]) {
              instances[j].components[componentName] = {};
            }
            Object.assign(instances[j].components[componentName], props);
          }
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
  
  // Write back (multi-document) with validation rollback
  const newContent = serializeStorageFileContent(filePath, docs, { body });
  const result = await safeWrite(filePath, newContent);
  
  if (!result.valid) {
    console.error('Validation failed after setting properties:');
    for (const err of result.errors) {
      console.error(`  ✗ ${err.message}`);
    }
    process.exit(1);
  }
  
  if (!options.quiet) {
    const propsStr = Object.entries(componentAssignments)
      .flatMap(([comp, props]) => 
        Object.entries(props).map(([k, v]) => `${comp}.${k}=${typeof v === 'string' ? `"${v}"` : v}`)
      )
      .join(', ');
    console.log(`Set ${className}:${id} ${propsStr}`);
  }
}
