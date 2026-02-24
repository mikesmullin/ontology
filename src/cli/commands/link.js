/**
 * Link Command Handler - Create relation instances (A-box)
 */

import { loadAll, getStoragePath } from '../../core/loader.js';
import { safeWrite } from '../../core/safe-write.js';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { parseStorageFileContent, serializeStorageFileContent } from '../../core/storage-file.js';

/**
 * Show link command help
 */
function showHelp() {
  console.log(`
ontology link - Create a relation between instances (A-box)

Usage:
  ontology link <from>:<class> <relation> <to>:<class> [qualifiers...]

Arguments:
  <from>:<class>    Source instance (e.g., jdoe:Person)
  <relation>        Relation name (e.g., MEMBER_OF, memberOf)
  <to>:<class>      Target instance (e.g., team-zulu:Team)
  [qualifiers...]   Optional qualifier values (key=value)

Options:
  --help            Show this help message
  --verbose         Show detailed output
  --quiet           Suppress output except errors

Description:
  Creates a relation instance between two class instances.
  The relation is stored in the source instance's file.

Examples:
  ontology link jdoe:Person MEMBER_OF team-zulu:Team
  ontology link jdoe:Person memberOf team-zulu:Team
  ontology link team-zulu:Team OWNS chess:Product role="maintainer"
  ontology link xyz:Team OWNS shoe1:Product since="2024-01-01"
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
 * Parse qualifier (key=value format)
 * @param {string} qualifier
 * @returns {{ key: string, value: string }}
 */
function parseQualifier(qualifier) {
  const match = qualifier.match(/^([^=]+)=(.*)$/);
  if (!match) {
    throw new Error(`Invalid qualifier format '${qualifier}'. Use format: key=value`);
  }
  
  let value = match[2];
  // Remove surrounding quotes if present
  if ((value.startsWith('"') && value.endsWith('"')) || 
      (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  
  return { key: match[1], value };
}

/**
 * Find the file containing an instance
 * @param {string} id
 * @param {Object} data
 * @returns {string | null}
 */
function findInstanceFile(id, data) {
  const matches = data.instances.classes.filter(i => i._id === id);
  if (matches.length === 0) {
    return null;
  }
  if (matches.length > 1) {
    const sources = matches.map(i => i._source).filter(Boolean).join(', ');
    throw new Error(`Duplicate _id '${id}' found in multiple files: ${sources}. Resolve duplicates before using 'link'.`);
  }
  return matches[0]._source;
}

/**
 * Handle the link command
 * @param {string[]} args
 */
export async function handleLink(args) {
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
  
  if (cleanArgs.length < 3) {
    console.error('Error: Link command requires at least 3 arguments.');
    console.error('Usage: ontology link <from>:<class> <relation> <to>:<class> [qualifiers...]');
    process.exit(1);
  }
  
  const [fromArg, relationName, toArg, ...qualifierArgs] = cleanArgs;

  if (relationName === 'LINKS_TO') {
    console.error(`Error: Relation '${relationName}' is reserved and managed implicitly from wiki links.`);
    process.exit(1);
  }
  
  let fromId, fromClass, toId, toClass;
  try {
    ({ id: fromId, className: fromClass } = parseIdentifier(fromArg));
    ({ id: toId, className: toClass } = parseIdentifier(toArg));
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
  
  // Parse qualifiers
  const qualifiers = {};
  for (const qualArg of qualifierArgs) {
    try {
      const { key, value } = parseQualifier(qualArg);
      qualifiers[key] = value;
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  }
  
  // Load existing data
  const data = await loadAll();
  
  // Check if relation is defined in schema
  if (!data.schema.relations[relationName]) {
    console.error(`Error: Relation '${relationName}' not defined in schema.`);
    process.exit(1);
  }
  
  const relationSchema = data.schema.relations[relationName];
  
  // Check domain/range match
  if (relationSchema.domain !== fromClass) {
    console.error(`Error: Relation '${relationName}' expects domain '${relationSchema.domain}', got '${fromClass}'.`);
    process.exit(1);
  }
  
  if (relationSchema.range !== toClass) {
    console.error(`Error: Relation '${relationName}' expects range '${relationSchema.range}', got '${toClass}'.`);
    process.exit(1);
  }
  
  // Check if both endpoints exist
  const fromMatches = data.instances.classes.filter(i => i._id === fromId);
  if (fromMatches.length === 0) {
    console.error(`Error: Source instance '${fromId}' not found.`);
    console.error("Hint: Create it with 'ontology import <file.yaml>' first.");
    process.exit(1);
  }
  if (fromMatches.length > 1) {
    const sources = fromMatches.map(i => i._source).filter(Boolean).join(', ');
    console.error(`Error: Duplicate _id '${fromId}' found in multiple files: ${sources}.`);
    console.error("Hint: Run 'ontology validate' and resolve duplicates before linking.");
    process.exit(1);
  }
  
  const toMatches = data.instances.classes.filter(i => i._id === toId);
  if (toMatches.length === 0) {
    console.error(`Error: Target instance '${toId}' not found.`);
    console.error("Hint: Create it with 'ontology import <file.yaml>' first.");
    process.exit(1);
  }
  if (toMatches.length > 1) {
    const sources = toMatches.map(i => i._source).filter(Boolean).join(', ');
    console.error(`Error: Duplicate _id '${toId}' found in multiple files: ${sources}.`);
    console.error("Hint: Run 'ontology validate' and resolve duplicates before linking.");
    process.exit(1);
  }
  
  // Check if relation already exists
  const existingRelation = data.instances.relations.find(
    r => r._from === fromId && r._relation === relationName && r._to === toId
  );
  if (existingRelation) {
    console.error(`Error: Relation '${fromId} -[${relationName}]-> ${toId}' already exists.`);
    process.exit(1);
  }
  
  // Find the source file (where _from instance is defined)
  let sourceFile;
  try {
    sourceFile = findInstanceFile(fromId, data);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
  if (!sourceFile) {
    console.error(`Error: Could not find file for instance '${fromId}'.`);
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
      // Find the source instance within this document's classes
      const classInstance = parsed.spec.classes.find(c => c._id === fromId);
      if (classInstance) {
        // Ensure relations object exists on the instance
        if (!classInstance.relations) {
          classInstance.relations = {};
        }
        
        // Ensure array exists for this relation type
        if (!classInstance.relations[relationName]) {
          classInstance.relations[relationName] = [];
        }
        
        // Create relation entry - simple form (just target id) or with qualifiers
        const hasQualifiers = Object.keys(qualifiers).length > 0;
        const relationEntry = hasQualifiers 
          ? { _to: toId, ...qualifiers }
          : toId;
        
        classInstance.relations[relationName].push(relationEntry);
        updated = true;
        break;
      }
    }
  }
  
  if (!updated) {
    console.error(`Error: Could not find spec section in '${sourceFile}'.`);
    process.exit(1);
  }
  
  // Write back (multi-document) with validation rollback
  const newContent = serializeStorageFileContent(filePath, docs, { body });
  const result = await safeWrite(filePath, newContent);
  
  if (!result.valid) {
    console.error('Validation failed after creating relation:');
    for (const err of result.errors) {
      console.error(`  ✗ ${err.message}`);
    }
    process.exit(1);
  }
  
  if (!options.quiet) {
    const qualStr = Object.keys(qualifiers).length > 0 
      ? ` (${Object.entries(qualifiers).map(([k, v]) => `${k}=${v}`).join(', ')})`
      : '';
    console.log(`Linked ${fromId} -[${relationName}]-> ${toId}${qualStr}`);
  }
}
