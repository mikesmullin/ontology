/**
 * YAML Loader - Load and parse ontology files from storage directory
 */

import { readdir, readFile } from 'fs/promises';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseStorageFileContent, extractWikiLinks, isMarkdownStorageFile } from './storage-file.js';

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
export const PROJECT_ROOT = resolve(__dirname, '..', '..');

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
 * List all ontology files in storage directory recursively
 * @param {string} storagePath
 * @returns {Promise<string[]>}
 */
async function listOntologyFiles(storagePath) {
  const files = [];
  const entries = await readdir(storagePath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(storagePath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listOntologyFiles(fullPath));
      continue;
    }

    if (!entry.isFile()) continue;

    const lowerName = entry.name.toLowerCase();
    if (lowerName.endsWith('.yml') || lowerName.endsWith('.yaml') || lowerName.endsWith('.md')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Parse a single ontology storage file
 * @param {string} filePath
 * @returns {Promise<{ docs: OntologyDocument[], body: string }>}
 */
async function parseOntologyFile(filePath) {
  const content = await readFile(filePath, 'utf-8');
  return parseStorageFileContent(filePath, content);
}

/**
 * Extract schema from documents
 * @param {OntologyDocument[]} docs
 * @param {string} filePath
 * @returns {{ components: Record<string, any>, classes: Record<string, any>, relations: Record<string, any>, namespace: string | null }}
 */
function extractSchema(docs, filePath) {
  const result = { components: {}, classes: {}, relations: {}, namespace: null };

  for (const doc of docs) {
    if (doc.apiVersion !== 'agent/v1' || doc.kind !== 'Ontology') continue;
    
    if (doc.metadata?.namespace && !result.namespace) {
      result.namespace = doc.metadata.namespace;
    }

    if (doc.schema?.components) {
      Object.assign(result.components, doc.schema.components);
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
 * Extract per-class relations from a class instance
 * @param {any} instance - Class instance with potential relations property
 * @param {string} namespace
 * @param {string} relativePath
 * @returns {RelationInstance[]}
 */
function extractPerClassRelations(instance, namespace, relativePath) {
  const relations = [];
  
  if (!instance.relations || typeof instance.relations !== 'object') {
    return relations;
  }

  const fromId = instance._id;
  
  for (const [relationName, targets] of Object.entries(instance.relations)) {
    if (!Array.isArray(targets)) continue;
    
    for (const target of targets) {
      // Target can be a string (just ID) or an object with _to and qualifiers
      if (typeof target === 'string') {
        relations.push({
          _from: fromId,
          _relation: relationName,
          _to: target,
          _namespace: namespace,
          _source: relativePath
        });
      } else if (typeof target === 'object' && target._to) {
        // Object with _to and qualifiers
        const { _to, ...qualifiers } = target;
        relations.push({
          _from: fromId,
          _relation: relationName,
          _to,
          ...qualifiers,
          _namespace: namespace,
          _source: relativePath
        });
      }
    }
  }
  
  return relations;
}

/**
 * Extract instances from documents
 * @param {OntologyDocument[]} docs
 * @param {string} filePath
 * @param {string} markdownBody
 * @returns {{ classes: ClassInstance[], relations: RelationInstance[] }}
 */
function extractInstances(docs, filePath, markdownBody = '') {
  const classes = [];
  const relations = [];
  const relativePath = filePath.replace(PROJECT_ROOT + '/', '');

  for (const doc of docs) {
    if (doc.apiVersion !== 'agent/v1' || doc.kind !== 'Ontology') continue;
    
    const namespace = doc.metadata?.namespace || 'default';
    
    if (doc.spec?.classes) {
      for (const instance of doc.spec.classes) {
        // Extract per-class relations first (before removing from instance)
        const instanceRelations = extractPerClassRelations(instance, namespace, relativePath);
        relations.push(...instanceRelations);
        
        // Create a copy without the relations property for the class instance
        const { relations: _, ...instanceWithoutRelations } = instance;
        
        classes.push({
          ...instanceWithoutRelations,
          _namespace: namespace,
          _source: relativePath
        });
      }

      if (isMarkdownStorageFile(filePath)) {
        const wikiLinks = extractWikiLinks(markdownBody);
        if (wikiLinks.length > 0) {
          for (const instance of doc.spec.classes) {
            for (const link of wikiLinks) {
              relations.push({
                _from: instance._id,
                _relation: 'LINKS_TO',
                _to: link.id,
                _toClass: link.className,
                _namespace: namespace,
                _source: relativePath
              });
            }
          }
        }
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

  const files = await listOntologyFiles(storagePath);
  
  /** @type {LoadedData} */
  const result = {
    schema: { components: {}, classes: {}, relations: {}, namespaces: new Set() },
    instances: { classes: [], relations: [] },
    files: [],
    rawDocuments: []
  };

  for (const filePath of files) {
    const { docs, body } = await parseOntologyFile(filePath);
    const relativePath = filePath.replace(PROJECT_ROOT + '/', '');
    
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
    Object.assign(result.schema.components, schema.components);
    Object.assign(result.schema.classes, schema.classes);
    Object.assign(result.schema.relations, schema.relations);
    if (schema.namespace) {
      result.schema.namespaces.add(schema.namespace);
    }

    // Extract instances
    const instances = extractInstances(docs, filePath, body);
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
