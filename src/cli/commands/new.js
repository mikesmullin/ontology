/**
 * New Command Handler - Create new A-box instances
 */

import { loadAll, getStoragePath } from '../../core/loader.js';
import { validate } from '../../core/validator.js';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import yaml from 'js-yaml';
import { existsSync } from 'fs';

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
  The instance will be stored in storage/<class>-<id>.yml
  
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
  const fileName = `${className.toLowerCase()}-${id}.yml`;
  return join(storagePath, fileName);
}

/**
 * Create a new YAML document for an instance
 * @param {string} className
 * @param {string} id
 * @param {string} namespace
 * @param {Record<string, string>} classComponents - Component mapping from class schema
 * @returns {Object}
 */
function createInstanceDocument(className, id, namespace, classComponents) {
  // Initialize empty components structure based on class schema
  const components = {};
  if (classComponents) {
    for (const localName of Object.keys(classComponents)) {
      components[localName] = {};
    }
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
  const identifier = args.find(a => !a.startsWith('-'));
  
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
  
  if (existsSync(filePath)) {
    console.error(`Error: File '${filePath}' already exists.`);
    process.exit(1);
  }
  
  const doc = createInstanceDocument(className, id, namespace, classComponents);
  const content = `# ${className}: ${id}\n${yaml.dump(doc, { lineWidth: -1, noRefs: true })}`;
  
  await writeFile(filePath, content, 'utf-8');
  
  // Validate
  const newData = await loadAll();
  const result = validate(newData);
  
  if (!result.valid) {
    console.error('Validation failed after creating instance:');
    for (const err of result.errors) {
      console.error(`  ✗ ${err.message}`);
    }
    // Note: We don't delete the file, let user fix it
    process.exit(1);
  }
  
  if (!options.quiet) {
    const relPath = filePath.replace(process.cwd() + '/', '');
    console.log(`Created ${className}:${id} in ${relPath}`);
  }
}
