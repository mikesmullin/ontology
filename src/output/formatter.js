/**
 * Output Formatters - Format search results for display
 */

import yaml from 'js-yaml';

/**
 * @typedef {import('../core/types.js').ClassInstance} ClassInstance
 * @typedef {import('../core/types.js').RelationInstance} RelationInstance
 * @typedef {import('../core/types.js').SearchMatch} SearchMatch
 */

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
 * Format matches as verbose YAML output
 * @param {{ classes: ClassInstance[], relations: RelationInstance[] }} matches
 * @returns {string}
 */
export function formatVerbose(matches) {
  const total = matches.classes.length + matches.relations.length;
  
  if (total === 0) {
    return 'No matches found.';
  }

  const groups = groupBySource(matches);
  const lines = [];

  for (const [source, group] of groups) {
    lines.push(`# ${source}`);
    
    const allInstances = [...group.classes, ...group.relations];
    const cleaned = allInstances.map(instance => {
      const copy = { ...instance };
      delete copy._namespace;
      delete copy._source;
      return copy;
    });
    
    lines.push(yaml.dump(cleaned, { lineWidth: -1, noRefs: true }).trimEnd());
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

/**
 * Format output based on options
 * @param {{ classes: ClassInstance[], relations: RelationInstance[] }} matches
 * @param {{ verbose?: boolean, ids?: boolean, count?: boolean }} options
 * @returns {string}
 */
export function format(matches, options = {}) {
  if (options.count) {
    return formatCount(matches);
  }
  if (options.ids) {
    return formatIds(matches);
  }
  if (options.verbose) {
    return formatVerbose(matches);
  }
  return formatSummary(matches);
}
