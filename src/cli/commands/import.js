/**
 * Import Command Handler - Import/upsert instances from YAML file
 */

import { loadAll, getStoragePath } from '../../core/loader.js';
import { safeWrite } from '../../core/safe-write.js';
import { mkdir, readFile } from 'fs/promises';
import { join, resolve, isAbsolute, dirname } from 'path';
import { existsSync } from 'fs';
import { parseStorageFileContent, serializeStorageFileContent } from '../../core/storage-file.js';
import yaml from 'js-yaml';

const ANSI_RESET = '\x1b[0m';
const ANSI_GREEN = '\x1b[38;2;80;200;120m';
const ANSI_YELLOW = '\x1b[38;2;235;195;90m';
const ANSI_RED = '\x1b[38;2;235;95;95m';

function colorize(text, color) {
  return `${color}${text}${ANSI_RESET}`;
}

function errorLabel() {
  return colorize('error', ANSI_RED);
}

function warningLabel() {
  return colorize('warning', ANSI_YELLOW);
}

/**
 * Show import command help
 */
function showHelp() {
  console.log(`
ontology import - Import/upsert schema and instances from YAML

Usage:
  ontology import <file.yaml> [options]

Arguments:
  <file.yaml>      Path to YAML file containing schema and/or instance data

Options:
  --help           Show this help message
  --verbose        Show detailed output
  --quiet          Suppress output except errors
  --force          Overwrite existing instances without prompting

Description:
  Imports one or more schema/instance documents from YAML. Creates or updates
  schema declarations and upserts class instances.

  Input instance format (single document):
    _class: Task
    _id: abc123                    # Optional: auto-generated if omitted
    components:
      workunit:
        id: abc123
        summary: My task
        description: Details here
        important: true
        urgent: false

  Ontology document format (schema import):
    apiVersion: agent/v1
    kind: Ontology
    metadata:
      namespace: stormy
    schema:
      components:
        WorkUnit:
          properties:
            summary: { type: string, required: true }
      classes:
        Task:
          components:
            workunit: WorkUnit

  Or batch format (multi-document):
    ---
    _class: Person
    _id: jdoe
    components:
      identity:
        name: John Doe
    ---
    _class: Person
    _id: asmith
    components:
      identity:
        name: Alice Smith

  Also supports markdown body via '_body' key:
    _class: Task
    _id: abc123
    _body: |
      # Task Title
      Description goes here
    components:
      workunit:
        summary: Task Title

Examples:
  ontology import task.yaml              # Import single instance
  ontology import batch.yaml --verbose   # Import multiple with verbose output
  ontology import update.yaml --force    # Overwrite existing without prompt
`);
}

/**
 * Generate a random SHA1-like ID
 * @returns {string}
 */
function generateId() {
  const crypto = require('crypto');
  const content = `${Date.now()}-${Math.random()}-${process.pid}`;
  return crypto.createHash('sha1').update(content).digest('hex');
}

/**
 * Validate an instance document
 * @param {Object} instance
 * @param {Object} schema
 * @param {Set<string>} existingIds
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
function validateInstance(instance, schema, existingIds) {
  const errors = [];
  const warnings = [];

  if (!instance._class) {
    errors.push('Missing required field: _class');
    return { valid: false, errors, warnings };
  }

  const classSchema = schema.classes[instance._class];
  if (!classSchema) {
    errors.push(`Unknown class: ${instance._class}`);
    return { valid: false, errors, warnings };
  }

  // Validate components against schema
  const components = instance.components || {};
  const classComponents = classSchema.components || {};

  for (const [localName, values] of Object.entries(components)) {
    const componentClass = classComponents[localName];
    if (!componentClass) {
      warnings.push(`Unknown component '${localName}' for class ${instance._class}`);
      continue;
    }

    const componentSchema = schema.components[componentClass];
    if (!componentSchema) {
      warnings.push(`Component schema '${componentClass}' not found`);
      continue;
    }

    // Validate required properties
    const props = componentSchema.properties || {};
    for (const [propName, propDef] of Object.entries(props)) {
      if (propDef.required && (values[propName] === undefined || values[propName] === null || values[propName] === '')) {
        errors.push(`Missing required property '${localName}.${propName}'`);
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Find or create the schema file path.
 * @param {any} data
 * @returns {string}
 */
function findSchemaFilePath(data) {
  const storagePath = getStoragePath();

  for (const { source, document } of data.rawDocuments || []) {
    if (document?.schema) {
      return join(storagePath, '..', source);
    }
  }

  return join(storagePath, 'org-stormy.md');
}

/**
 * Parse supported import YAML documents into schema docs and instance docs.
 * @param {any[]} docs
 * @returns {{ schemaDocs: any[], instances: any[] }}
 */
function parseImportDocuments(docs) {
  const schemaDocs = [];
  const instances = [];

  for (const doc of docs) {
    if (!isObject(doc)) continue;

    const isOntologyDoc = doc.apiVersion === 'agent/v1' && doc.kind === 'Ontology';

    if (isOntologyDoc && isObject(doc.schema)) {
      schemaDocs.push(doc);
    }

    if (isOntologyDoc && Array.isArray(doc.spec?.classes)) {
      for (const instance of doc.spec.classes) {
        if (isObject(instance)) instances.push({ ...instance });
      }
      continue;
    }

    if (typeof doc._class === 'string') {
      instances.push({ ...doc });
    }
  }

  return { schemaDocs, instances };
}

/**
 * Merge imported schema documents into the on-disk schema file.
 * @param {any[]} schemaDocs
 * @param {any} data
 * @param {{ quiet: boolean }} options
 * @returns {Promise<number>} count of merged schema docs
 */
async function importSchemaDocs(schemaDocs, data, options) {
  if (!schemaDocs.length) return 0;

  const schemaFilePath = findSchemaFilePath(data);
  const existingContent = existsSync(schemaFilePath)
    ? await readFile(schemaFilePath, 'utf-8')
    : '';

  const { docs: parsedDocs, body } = parseStorageFileContent(schemaFilePath, existingContent);
  const targetDoc = isObject(parsedDocs[0]) ? parsedDocs[0] : {
    apiVersion: 'agent/v1',
    kind: 'Ontology',
    metadata: { namespace: 'stormy' }
  };

  if (!isObject(targetDoc.metadata)) targetDoc.metadata = {};
  if (!isObject(targetDoc.schema)) targetDoc.schema = {};
  if (!isObject(targetDoc.schema.components)) targetDoc.schema.components = {};
  if (!isObject(targetDoc.schema.classes)) targetDoc.schema.classes = {};
  if (!isObject(targetDoc.schema.relations)) targetDoc.schema.relations = {};

  for (const incoming of schemaDocs) {
    if (incoming.metadata?.namespace && !targetDoc.metadata.namespace) {
      targetDoc.metadata.namespace = incoming.metadata.namespace;
    }
    if (isObject(incoming.schema?.components)) {
      Object.assign(targetDoc.schema.components, incoming.schema.components);
    }
    if (isObject(incoming.schema?.classes)) {
      Object.assign(targetDoc.schema.classes, incoming.schema.classes);
    }
    if (isObject(incoming.schema?.relations)) {
      Object.assign(targetDoc.schema.relations, incoming.schema.relations);
    }
  }

  const newContent = serializeStorageFileContent(schemaFilePath, [targetDoc], { body });
  const writeResult = await safeWrite(schemaFilePath, newContent, data);
  if (!writeResult.valid) {
    const details = (writeResult.errors || [])
      .map((err) => err?.message || String(err))
      .join('\n  - ');
    throw new Error(`Schema import validation failed:\n  - ${details}`);
  }

  if (!options.quiet) {
    console.log(`${colorize('merged', ANSI_YELLOW)} schema into ${schemaFilePath}`);
  }

  return schemaDocs.length;
}

/**
 * Create the storage file for an instance
 * @param {Object} instance
 * @param {string} namespace
 * @returns {string}
 */
function createInstanceDocument(instance, namespace) {
  const doc = {
    apiVersion: 'agent/v1',
    kind: 'Ontology',
    metadata: { namespace },
    spec: {
      classes: [
        {
          _class: instance._class,
          _id: instance._id,
          components: instance.components || {},
          ...(instance.relations ? { relations: instance.relations } : {})
        }
      ]
    }
  };

  const body = instance._body || '';
  const filePath = `${instance._id}.md`; // Just for serialization format detection
  return serializeStorageFileContent(filePath, [doc], { body });
}

/**
 * Handle the import command
 * @param {string[]} args
 */
export async function handleImport(args) {
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    showHelp();
    return;
  }

  const options = {
    verbose: args.includes('--verbose'),
    quiet: args.includes('--quiet') || args.includes('-q')
  };

  // Get the file path (filter out flags)
  const cleanArgs = args.filter(a => !a.startsWith('-'));
  const inputFile = cleanArgs[0];

  if (!inputFile) {
    console.error(`${errorLabel()}: no input file specified.`);
    console.error('Usage: ontology import <file.yaml>');
    process.exit(1);
  }

  // Resolve file path
  const filePath = isAbsolute(inputFile) ? inputFile : resolve(process.cwd(), inputFile);

  if (!existsSync(filePath)) {
    console.error(`${errorLabel()}: file not found: ${filePath}`);
    process.exit(1);
  }

  // Read and parse YAML
  let content;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch (err) {
    console.error(`${errorLabel()} reading file: ${err.message}`);
    process.exit(1);
  }

  let rawDocs;
  try {
    // Support multi-document YAML
    const docs = yaml.loadAll(content).filter(d => d !== null && d !== undefined);
    if (docs.length === 0) {
      console.error(`${errorLabel()}: no valid YAML documents found in file.`);
      process.exit(1);
    }
    rawDocs = docs;
  } catch (err) {
    console.error(`${errorLabel()} parsing YAML: ${err.message}`);
    process.exit(1);
  }

  const { schemaDocs, instances } = parseImportDocuments(rawDocs);
  if (schemaDocs.length === 0 && instances.length === 0) {
    console.error(`${errorLabel()}: no importable documents found.`);
    console.error('Supported formats: instance documents or kind: Ontology documents with schema/spec.');
    process.exit(1);
  }

  // Load existing ontology data for validation
  let data = await loadAll();

  // Import schema docs first so instance validation uses latest declarations
  let schemaMerged = 0;
  if (schemaDocs.length > 0) {
    try {
      schemaMerged = await importSchemaDocs(schemaDocs, data, options);
      data = await loadAll();
    } catch (err) {
      console.error(`${errorLabel()} importing schema: ${err.message}`);
      process.exit(1);
    }
  }

  const existingIds = new Set(data.instances.classes.map(i => i._id));

  const storagePath = getStoragePath();
  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const instance of instances) {
    // Generate ID if not provided
    if (!instance._id) {
      instance._id = generateId();
      // Ensure uniqueness
      while (existingIds.has(instance._id)) {
        instance._id = generateId();
      }
    }

    // Validate
    const { valid, errors, warnings } = validateInstance(instance, data.schema, existingIds);

    if (warnings.length > 0 && options.verbose) {
      for (const w of warnings) {
        console.warn(`${warningLabel()} (${instance._id}): ${w}`);
      }
    }

    if (!valid) {
      console.error(`${errorLabel()}: validation failed for instance '${instance._id}':`);
      for (const e of errors) {
        console.error(`  ${colorize('✗', ANSI_RED)} ${e}`);
      }
      failed++;
      continue;
    }

    // Check if exists
    const isUpdate = existingIds.has(instance._id);

    // Generate file path
    const className = instance._class;
    const classDir = join(storagePath, className);
    const instanceFile = join(classDir, `${instance._id}.md`);

    // Ensure directory exists
    if (!existsSync(classDir)) {
      await mkdir(classDir, { recursive: true });
    }

    // Get namespace from existing data or use default
    const namespace = [...(data.schema.namespaces || [])][0] || 'stormy';

    // Generate content
    const fileContent = createInstanceDocument(instance, namespace);

    // Write file
    try {
      const writeResult = await safeWrite(instanceFile, fileContent, data);
      if (!writeResult.valid) {
        const details = (writeResult.errors || [])
          .map((err) => err?.message || String(err))
          .join('\n  - ');
        console.error(`${errorLabel()}: validation failed for '${instance._id}', write rolled back:\n  - ${details}`);
        failed++;
        continue;
      }

      existingIds.add(instance._id);

      if (isUpdate) {
        updated++;
        if (!options.quiet) {
          console.log(`${colorize('modified', ANSI_YELLOW)} ${className}:${instance._id}`);
        }
      } else {
        created++;
        if (!options.quiet) {
          console.log(`${colorize('created', ANSI_GREEN)} ${className}:${instance._id}`);
        }
      }
    } catch (err) {
      console.error(`${errorLabel()} writing ${instance._id}: ${err.message}`);
      failed++;
    }
  }

  // Summary
  if (!options.quiet) {
    const parts = [];
    if (schemaMerged > 0) parts.push(`${schemaMerged} ${colorize('merged', ANSI_YELLOW)} schema docs`);
    if (created > 0) parts.push(`${created} ${colorize('created', ANSI_GREEN)}`);
    if (updated > 0) parts.push(`${updated} ${colorize('modified', ANSI_YELLOW)}`);
    if (failed > 0) parts.push(`${failed} failed`);
    if (parts.length > 0) {
      console.log(`\nimport complete: ${parts.join(', ')}`);
    }
  }

  if (failed > 0) {
    process.exit(1);
  }
}
