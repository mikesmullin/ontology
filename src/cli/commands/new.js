/**
 * New Command Handler - Create new A-box instances
 */

import { loadAll, getStoragePath, PROJECT_ROOT } from '../../core/loader.js';
import { safeWrite } from '../../core/safe-write.js';
import { mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { serializeStorageFileContent } from '../../core/storage-file.js';

/**
 * Show new command help
 */
function showHelp() {
  console.log(`
ontology new - Create a new class instance (A-box)

Usage:
  ontology new <id>:<class> [options]

Arguments:
  <id>:<class>     Instance ID and class type (e.g., jdoe:Person, team-alpha:Team)

Options:
  --help           Show this help message
  --verbose        Show detailed output
  --quiet          Suppress output except errors

Description:
  Creates a new instance of a class in the ontology storage.
  The instance will be stored in storage/<Class>/<id>.md
  
  The new instance is created with an empty 'components' structure
  based on the class schema. Use 'ontology set' to populate values.

Examples:
  ontology new jdoe:Person        # Create new Person instance
  ontology new team-zulu:Team     # Create new Team instance
  ontology new chess:Product      # Create new Product instance
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
 * Generate file path for an instance
 * @param {string} className
 * @param {string} id
 * @returns {string}
 */
function getInstanceFilePath(className, id) {
  const storagePath = getStoragePath();
  return join(storagePath, className, `${id}.md`);
}

/**
 * Create a new YAML document for an instance
 * @param {string} className
 * @param {string} id
 * @param {string} namespace
 * @param {Record<string, string>} classComponents - Component mapping from class schema
 * @param {Array<{comp: string, key: string, value: string}>} initialValues - Initial property values
 * @returns {Object}
 */
function createInstanceDocument(className, id, namespace, classComponents, initialValues = []) {
  // Initialize empty components structure based on class schema
  const components = {};
  if (classComponents) {
    for (const localName of Object.keys(classComponents)) {
      components[localName] = {};
    }
  }

  // Apply initial values
  for (const { comp, key, value } of initialValues) {
    if (!components[comp]) {
      components[comp] = {};
    }
    components[comp][key] = value;
  }

  return {
    apiVersion: 'agent/v1',
    kind: 'Ontology',
    metadata: {
      namespace
    },
    spec: {
      classes: [
        {
          _class: className,
          _id: id,
          components: Object.keys(components).length > 0 ? components : undefined
        }
      ]
    }
  };
}

/**
 * Handle the new command
 * @param {string[]} args
 */
export async function handleNew(args) {
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    showHelp();
    return;
  }
  
  const options = {
    verbose: args.includes('--verbose'),
    quiet: args.includes('--quiet') || args.includes('-q')
  };
  
  // Get the identifier (filter out flags)
  const cleanArgs = args.filter(a => !a.startsWith('-'));
  const identifier = cleanArgs[0];
  
  // Parse inline property setters (comp.key=value)
  const initialValues = [];
  for (const arg of cleanArgs.slice(1)) {
    const eqIdx = arg.indexOf('=');
    if (eqIdx === -1) continue;
    const path = arg.slice(0, eqIdx);
    let value = arg.slice(eqIdx + 1);
    const dotIdx = path.indexOf('.');
    if (dotIdx === -1) {
      console.error(`Error: Property '${path}' must be in comp.key format.`);
      process.exit(1);
    }
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || 
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    // Parse array syntax: [val1, val2]
    if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
      const inner = value.slice(1, -1).trim();
      value = inner === '' ? [] : inner.split(',').map(item => {
        item = item.trim();
        if ((item.startsWith('"') && item.endsWith('"')) || 
            (item.startsWith("'") && item.endsWith("'"))) {
          item = item.slice(1, -1);
        }
        return item;
      });
    } else if (value === 'true') {
      value = true;
    } else if (value === 'false') {
      value = false;
    }
    const comp = path.slice(0, dotIdx);
    const key = path.slice(dotIdx + 1);
    initialValues.push({ comp, key, value });
  }
  
  if (!identifier) {
    console.error('Error: Instance identifier required.');
    console.error('Usage: ontology new <id>:<class>');
    process.exit(1);
  }
  
  let id, className;
  try {
    ({ id, className } = parseIdentifier(identifier));
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
  
  // Load existing data
  const data = await loadAll();
  
  // Check if class is defined in schema
  if (!data.schema.classes[className]) {
    console.error(`Error: Class '${className}' not defined in schema.`);
    console.error(`Hint: Run 'ontology decl cls :${className}' first.`);
    process.exit(1);
  }
  
  // Check if instance already exists
  const existingInstance = data.instances.classes.find(i => i._id === id);
  if (existingInstance) {
    console.error(`Error: Instance with _id '${id}' already exists (${existingInstance._class}:${id} in ${existingInstance._source}).`);
    process.exit(1);
  }
  
  // Get namespace from existing schema
  const namespace = [...data.schema.namespaces][0] || 'default';
  
  // Get the class schema to know which components to initialize
  const classSchema = data.schema.classes[className];
  const classComponents = classSchema?.components || {};
  
  // Create the new instance document
  const filePath = getInstanceFilePath(className, id);
  await mkdir(join(getStoragePath(), className), { recursive: true });
  
  if (existsSync(filePath)) {
    console.error(`Error: File '${filePath}' already exists.`);
    process.exit(1);
  }
  
  const doc = createInstanceDocument(className, id, namespace, classComponents, initialValues);
  const body = `# ${className}/${id}\n\n`;
  const content = serializeStorageFileContent(filePath, [doc], { body });
  
  // Write with validation rollback
  const result = await safeWrite(filePath, content, { isNew: true });
  
  if (!result.valid) {
    console.error('Validation failed after creating instance:');
    for (const err of result.errors) {
      console.error(`  ✗ ${err.message}`);
    }
    process.exit(1);
  }
  
  if (!options.quiet) {
    const relPath = filePath.replace(PROJECT_ROOT + '/', '');
    console.log(`Created ${className}:${id} in ${relPath}`);
  }
}
