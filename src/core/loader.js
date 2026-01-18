/**
 * YAML Loader - Load and parse ontology files from storage directory
 */

import { readdir, readFile } from 'fs/promises';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseAllDocuments } from 'yaml';

/**
 * @typedef {import('./types.js').OntologyDocument} OntologyDocument
 * @typedef {import('./types.js').ClassInstance} ClassInstance
 * @typedef {import('./types.js').RelationInstance} RelationInstance
 * @typedef {import('./types.js').LoadedData} LoadedData
 */

// Get the directory where this source file lives
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Project root is two levels up from src/core/
const PROJECT_ROOT = resolve(__dirname, '..', '..');

/**
 * Get the storage directory path
 * @returns {string}
 */
export function getStoragePath() {
  return resolve(PROJECT_ROOT, 'storage');
}

/**
 * Check if storage directory exists
 * @param {string} storagePath
 * @returns {Promise<boolean>}
 */
async function storageExists(storagePath) {
  try {
    const stat = await import('fs/promises').then(m => m.stat(storagePath));
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * List all YAML files in storage directory
 * @param {string} storagePath
 * @returns {Promise<string[]>}
 */
async function listYamlFiles(storagePath) {
  const entries = await readdir(storagePath, { withFileTypes: true });
  return entries
    .filter(e => e.isFile() && (e.name.endsWith('.yml') || e.name.endsWith('.yaml')))
    .map(e => join(storagePath, e.name));
}

/**
 * Parse a single YAML file (supports multi-document)
 * @param {string} filePath
 * @returns {Promise<OntologyDocument[]>}
 */
async function parseYamlFile(filePath) {
  const content = await readFile(filePath, 'utf-8');
  const docs = parseAllDocuments(content);
  
  return docs
    .map(doc => doc.toJS())
    .filter(doc => doc !== null && doc !== undefined);
}

/**
 * Extract schema from documents
 * @param {OntologyDocument[]} docs
 * @param {string} filePath
 * @returns {{ classes: Record<string, any>, relations: Record<string, any>, namespace: string | null }}
 */
function extractSchema(docs, filePath) {
  const result = { classes: {}, relations: {}, namespace: null };

  for (const doc of docs) {
    if (doc.apiVersion !== 'agent/v1' || doc.kind !== 'Ontology') continue;
    
    if (doc.metadata?.namespace && !result.namespace) {
      result.namespace = doc.metadata.namespace;
    }

    if (doc.schema?.classes) {
      Object.assign(result.classes, doc.schema.classes);
    }
    if (doc.schema?.relations) {
      Object.assign(result.relations, doc.schema.relations);
    }
  }

  return result;
}

/**
 * Extract instances from documents
 * @param {OntologyDocument[]} docs
 * @param {string} filePath
 * @returns {{ classes: ClassInstance[], relations: RelationInstance[] }}
 */
function extractInstances(docs, filePath) {
  const classes = [];
  const relations = [];
  const relativePath = filePath.replace(process.cwd() + '/', '');

  for (const doc of docs) {
    if (doc.apiVersion !== 'agent/v1' || doc.kind !== 'Ontology') continue;
    
    const namespace = doc.metadata?.namespace || 'default';

    if (doc.spec?.classes) {
      for (const instance of doc.spec.classes) {
        classes.push({
          ...instance,
          _namespace: namespace,
          _source: relativePath
        });
      }
    }

    if (doc.spec?.relations) {
      for (const instance of doc.spec.relations) {
        relations.push({
          ...instance,
          _namespace: namespace,
          _source: relativePath
        });
      }
    }
  }

  return { classes, relations };
}

/**
 * Load all ontology data from storage directory
 * @param {string} [customPath]
 * @returns {Promise<LoadedData>}
 */
export async function loadAll(customPath) {
  const storagePath = customPath || getStoragePath();

  if (!(await storageExists(storagePath))) {
    throw new Error(`Storage directory not found: ${storagePath}`);
  }

  const files = await listYamlFiles(storagePath);
  
  /** @type {LoadedData} */
  const result = {
    schema: { classes: {}, relations: {}, namespaces: new Set() },
    instances: { classes: [], relations: [] },
    files: [],
    rawDocuments: []
  };

  for (const filePath of files) {
    const docs = await parseYamlFile(filePath);
    const relativePath = filePath.replace(process.cwd() + '/', '');
    
    result.files.push(relativePath);

    // Store raw documents for validation
    for (const doc of docs) {
      result.rawDocuments.push({
        source: relativePath,
        document: doc
      });
    }

    // Extract schema
    const schema = extractSchema(docs, filePath);
    Object.assign(result.schema.classes, schema.classes);
    Object.assign(result.schema.relations, schema.relations);
    if (schema.namespace) {
      result.schema.namespaces.add(schema.namespace);
    }

    // Extract instances
    const instances = extractInstances(docs, filePath);
    result.instances.classes.push(...instances.classes);
    result.instances.relations.push(...instances.relations);

    // Also track namespace from instances
    for (const doc of docs) {
      if (doc.metadata?.namespace) {
        result.schema.namespaces.add(doc.metadata.namespace);
      }
    }
  }

  return result;
}

/**
 * Load only schema data from storage directory
 * @param {string} [customPath]
 * @returns {Promise<{ classes: Record<string, any>, relations: Record<string, any>, namespaces: Set<string> }>}
 */
export async function loadSchema(customPath) {
  const data = await loadAll(customPath);
  return data.schema;
}

/**
 * Load only instance data from storage directory
 * @param {string} [customPath]
 * @returns {Promise<{ classes: ClassInstance[], relations: RelationInstance[] }>}
 */
export async function loadInstances(customPath) {
  const data = await loadAll(customPath);
  return data.instances;
}
