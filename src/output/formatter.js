/**
 * Output Formatters - Format search results for display
 */

import yaml from 'js-yaml';
import { readFileSync } from 'fs';
import { highlightMatch } from '../query/matchers.js';

/**
 * @typedef {import('../core/types.js').ClassInstance} ClassInstance
 * @typedef {import('../core/types.js').RelationInstance} RelationInstance
 * @typedef {import('../query/evaluator.js').SearchResult} SearchResult
 * @typedef {import('../query/evaluator.js').ClassSearchResult} ClassSearchResult
 * @typedef {import('../query/evaluator.js').RelationSearchResult} RelationSearchResult
 */

/**
 * Cache for file contents and line number lookups
 * @type {Map<string, string[]>}
 */
const fileCache = new Map();

/**
 * Get file lines (cached)
 * @param {string} filePath
 * @returns {string[]}
 */
function getFileLines(filePath) {
  if (!fileCache.has(filePath)) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      fileCache.set(filePath, content.split('\n'));
    } catch {
      fileCache.set(filePath, []);
    }
  }
  return fileCache.get(filePath);
}

/**
 * Find line number for a property in a YAML file
 * @param {string} filePath
 * @param {string} propertyName
 * @param {string} propertyValue
 * @returns {number}
 */
function findPropertyLineNumber(filePath, propertyName, propertyValue) {
  const lines = getFileLines(filePath);
  const valueStr = String(propertyValue);
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Look for "propertyName: value" or "propertyName: "value""
    if (line.includes(`${propertyName}:`) && line.includes(valueStr.substring(0, 20))) {
      return i + 1; // 1-indexed
    }
  }
  
  return 0;
}

/**
 * Find line number for a relation in a YAML file
 * @param {string} filePath
 * @param {string} relationType
 * @param {string} toId
 * @returns {number}
 */
function findRelationLineNumber(filePath, relationType, toId) {
  const lines = getFileLines(filePath);
  
  // Look for the relation type first
  let inRelationType = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.includes(`${relationType}:`)) {
      inRelationType = true;
    }
    
    if (inRelationType && line.includes(toId)) {
      return i + 1;
    }
    
    // Reset if we hit another relation type
    if (inRelationType && /^\s+[A-Z_]+:/.test(line) && !line.includes(`${relationType}:`)) {
      inRelationType = false;
    }
  }
  
  return 0;
}

/**
 * Format a class search result for grep-like output
 * Format: <file>:<line>:<id>:<Class>.<property>: <value>
 * @param {ClassSearchResult} result
 * @returns {string[]}
 */
function formatClassResult(result) {
  const lines = [];
  const instance = result.instance;
  const source = instance._source || 'unknown';
  
  for (const match of result.matches) {
    const lineNum = findPropertyLineNumber(source, match.property, match.value);
    const highlightedValue = highlightMatch(match.value, match.matchedText);
    
    lines.push(`${source}:${lineNum}:${instance._id}:${instance._class}.${match.property}: ${highlightedValue}`);
  }
  
  return lines;
}

/**
 * Format a relation search result
 * Format: <file>:<line>: <from>:<Class> :<RELATION> <to>:<Class> [qualifier="value"]
 * @param {RelationSearchResult} result
 * @returns {string}
 */
function formatRelationResult(result) {
  const rel = result.relation;
  const fromInstance = result.fromInstance;
  const toInstance = result.toInstance;
  const source = rel._source || 'unknown';
  
  const lineNum = findRelationLineNumber(source, rel._relation, rel._to);
  
  const fromPart = `${fromInstance._id}:${fromInstance._class}`;
  const toPart = toInstance ? `${rel._to}:${toInstance._class}` : rel._to;
  
  // Build qualifier string
  const qualifiers = [];
  for (const [key, value] of Object.entries(rel)) {
    if (!key.startsWith('_')) {
      const valueStr = typeof value === 'string' ? `"${value}"` : String(value);
      if (result.matchedQualifier === key && result.matchedValue) {
        qualifiers.push(`${key}=${highlightMatch(valueStr, result.matchedValue)}`);
      } else {
        qualifiers.push(`${key}=${valueStr}`);
      }
    }
  }
  
  let line = `${source}:${lineNum}: ${fromPart} :${rel._relation} ${toPart}`;
  if (qualifiers.length > 0) {
    line += ` ${qualifiers.join(' ')}`;
  }
  
  return line;
}

/**
 * Format search results for grep-like output
 * @param {SearchResult[]} results
 * @param {{ verbose?: boolean, ids?: boolean, count?: boolean }} options
 * @returns {string}
 */
export function formatSearchResults(results, options = {}) {
  if (options.count) {
    return String(results.length);
  }
  
  if (results.length === 0) {
    return 'No matches found.';
  }
  
  if (options.ids) {
    const ids = new Set();
    for (const result of results) {
      if (result.type === 'class') {
        ids.add(result.instance._id);
      } else if (result.type === 'relation') {
        ids.add(`${result.relation._from}-${result.relation._relation}-${result.relation._to}`);
      }
    }
    return Array.from(ids).join('\n');
  }
  
  if (options.verbose) {
    return formatVerbose(results);
  }
  
  // Default grep-like output
  const lines = [];
  
  for (const result of results) {
    if (result.type === 'class') {
      lines.push(...formatClassResult(result));
    } else if (result.type === 'relation') {
      lines.push(formatRelationResult(result));
    }
  }
  
  return lines.join('\n');
}

/**
 * Format results as verbose YAML output
 * @param {SearchResult[]} results
 * @returns {string}
 */
function formatVerbose(results) {
  const groups = new Map();
  
  for (const result of results) {
    const source = result.type === 'class' 
      ? result.instance._source 
      : result.relation._source;
    
    if (!groups.has(source)) {
      groups.set(source, { classes: [], relations: [] });
    }
    
    if (result.type === 'class') {
      groups.get(source).classes.push(result.instance);
    } else {
      groups.get(source).relations.push(result.relation);
    }
  }
  
  const lines = [];
  for (const [source, group] of groups) {
    lines.push(`# ${source}`);
    
    const items = [...group.classes, ...group.relations].map(item => {
      const copy = { ...item };
      delete copy._namespace;
      delete copy._source;
      return copy;
    });
    
    lines.push(yaml.dump(items, { lineWidth: -1, noRefs: true }).trimEnd());
    lines.push('');
  }
  
  return lines.join('\n').trimEnd();
}

// Legacy exports for backward compatibility
export { formatSearchResults as format };

/**
 * Create a summary line for a class instance
 * @param {ClassInstance} instance
 * @returns {string}
 */
function formatClassSummary(instance) {
  const parts = [`${instance._class}:${instance._id}`];
  
  // Add name if available
  if (instance.name) {
    parts.push('—', instance.name);
  }
  
  // Add email if available
  if (instance.email) {
    parts.push(`<${instance.email}>`);
  }
  
  return parts.join(' ');
}

/**
 * Create a summary line for a relation instance
 * @param {RelationInstance} instance
 * @returns {string}
 */
function formatRelationSummary(instance) {
  let summary = `${instance._from} —[${instance._relation}]→ ${instance._to}`;
  
  // Add qualifiers if present
  const qualifiers = Object.entries(instance)
    .filter(([k]) => !k.startsWith('_'))
    .map(([k, v]) => `${k}=${v}`);
  
  if (qualifiers.length > 0) {
    summary += ` (${qualifiers.join(', ')})`;
  }
  
  return summary;
}

/**
 * Group matches by source file
 * @param {{ classes: ClassInstance[], relations: RelationInstance[] }} matches
 * @returns {Map<string, { classes: ClassInstance[], relations: RelationInstance[] }>}
 */
function groupBySource(matches) {
  const groups = new Map();

  for (const instance of matches.classes) {
    const source = instance._source || 'unknown';
    if (!groups.has(source)) {
      groups.set(source, { classes: [], relations: [] });
    }
    groups.get(source).classes.push(instance);
  }

  for (const instance of matches.relations) {
    const source = instance._source || 'unknown';
    if (!groups.has(source)) {
      groups.set(source, { classes: [], relations: [] });
    }
    groups.get(source).relations.push(instance);
  }

  return groups;
}

/**
 * Format matches as summary (default output)
 * @param {{ classes: ClassInstance[], relations: RelationInstance[] }} matches
 * @returns {string}
 */
export function formatSummary(matches) {
  const total = matches.classes.length + matches.relations.length;
  
  if (total === 0) {
    return 'No matches found.';
  }

  const lines = [`Found ${total} match${total === 1 ? '' : 'es'}:`, ''];
  const groups = groupBySource(matches);

  for (const [source, group] of groups) {
    lines.push(source);
    
    for (const instance of group.classes) {
      lines.push(`  ${formatClassSummary(instance)}`);
    }
    
    for (const instance of group.relations) {
      lines.push(`  ${formatRelationSummary(instance)}`);
    }
    
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

/**
 * Format matches as JSON
 * @param {{ classes: ClassInstance[], relations: RelationInstance[] }} matches
 * @returns {string}
 */
export function formatJson(matches) {
  const allInstances = [...matches.classes, ...matches.relations];
  const cleaned = allInstances.map(instance => {
    const copy = { ...instance };
    delete copy._namespace;
    delete copy._source;
    return copy;
  });
  return JSON.stringify(cleaned, null, 2);
}

/**
 * Format matches as IDs only
 * @param {{ classes: ClassInstance[], relations: RelationInstance[] }} matches
 * @returns {string}
 */
export function formatIds(matches) {
  const ids = [];
  
  for (const instance of matches.classes) {
    if (instance._id) {
      ids.push(instance._id);
    }
  }
  
  for (const instance of matches.relations) {
    // For relations, show the from-relation-to as identifier
    ids.push(`${instance._from}-${instance._relation}-${instance._to}`);
  }
  
  if (ids.length === 0) {
    return 'No matches found.';
  }
  
  return ids.join('\n');
}

/**
 * Format matches as count only
 * @param {{ classes: ClassInstance[], relations: RelationInstance[] }} matches
 * @returns {string}
 */
export function formatCount(matches) {
  return String(matches.classes.length + matches.relations.length);
}
