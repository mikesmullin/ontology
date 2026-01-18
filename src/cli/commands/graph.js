/**
 * Graph command - visualize relationship graph
 * Usage: ontology graph [-d <depth>] [-f <format>] <identifier>
 */

import { loadAll } from '../../core/loader.js';
import { buildIndex } from '../../core/index.js';

/**
 * Build outgoing edges map from relations
 * @param {Array} relations - All relation instances
 * @returns {Map} Map of _id -> [{relation, target}]
 */
function buildOutgoingEdges(relations) {
  const edges = new Map();
  
  for (const rel of relations) {
    const from = rel._from;
    const relation = rel._relation;
    const to = rel._to;
    
    if (!from || !relation || !to) continue;
    
    if (!edges.has(from)) {
      edges.set(from, []);
    }
    edges.get(from).push({ relation, target: to });
  }
  
  return edges;
}

/**
 * Walk graph following outgoing edges
 * @param {string} startId - Starting node ID
 * @param {Map} edges - Outgoing edges map
 * @param {number} maxDepth - Maximum traversal depth
 * @returns {Array} Array of {id, relation, target, depth} rows
 */
function walkGraph(startId, edges, maxDepth) {
  const rows = [];
  const visited = new Set();
  const queue = [{ id: startId, depth: 0 }];
  
  while (queue.length > 0) {
    const { id, depth } = queue.shift();
    
    if (visited.has(id) || depth > maxDepth) continue;
    visited.add(id);
    
    const nodeEdges = edges.get(id) || [];
    for (const { relation, target } of nodeEdges) {
      rows.push({ id, relation, target, depth });
      if (depth + 1 <= maxDepth && !visited.has(target)) {
        queue.push({ id: target, depth: depth + 1 });
      }
    }
  }
  
  return rows;
}

/**
 * Format rows as aligned table
 * @param {Array} rows - Array of {id, relation, target} objects
 * @returns {string} Formatted table
 */
function formatTable(rows) {
  if (rows.length === 0) {
    return 'No relationships found.';
  }
  
  const headers = ['_id', 'relation', 'parent'];
  
  // Calculate column widths
  const widths = [
    Math.max(headers[0].length, ...rows.map(r => r.id.length)),
    Math.max(headers[1].length, ...rows.map(r => r.relation.length)),
    Math.max(headers[2].length, ...rows.map(r => r.target.length))
  ];
  
  const pad = (str, width) => str.padEnd(width);
  
  // Build header
  const headerLine = headers.map((h, i) => pad(h, widths[i])).join(' | ');
  const separatorLine = widths.map(w => '-'.repeat(w)).join('-|-');
  
  // Build data rows
  const dataLines = rows.map(row => 
    [row.id, row.relation, row.target].map((val, i) => pad(val, widths[i])).join(' | ')
  );
  
  return [headerLine, separatorLine, ...dataLines].join('\n');
}

/**
 * Execute graph command
 * @param {Array} args - Command arguments
 */
export async function handleGraph(args) {
  // Parse options
  let depth = 1;
  let format = 'table';
  let identifier = null;
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-d' || arg === '--depth') {
      depth = parseInt(args[++i], 10);
      if (isNaN(depth) || depth < 0) {
        console.error('Error: depth must be a non-negative integer');
        process.exit(1);
      }
    } else if (arg === '-f' || arg === '--format') {
      format = args[++i];
      if (!['table'].includes(format)) {
        console.error('Error: unsupported format (only table supported)');
        process.exit(1);
      }
    } else if (arg === '-h' || arg === '--help') {
      printHelp();
      return;
    } else if (!arg.startsWith('-')) {
      identifier = arg;
    }
  }
  
  if (!identifier) {
    console.error('Error: identifier required');
    console.error('Usage: ontology graph [-d <depth>] [-f <format>] <identifier>');
    process.exit(1);
  }
  
  // Load and index data
  const data = await loadAll();
  const relations = data.instances.relations;
  const index = buildIndex(data);
  
  // Find starting node
  if (!index.byId.has(identifier)) {
    console.error(`Error: instance '${identifier}' not found`);
    process.exit(1);
  }
  
  // Build edges and walk graph
  const edges = buildOutgoingEdges(relations);
  const rows = walkGraph(identifier, edges, depth);
  
  // Format and output
  console.log(formatTable(rows));
}

function printHelp() {
  console.log(`Usage: ontology graph [-d <depth>] [-f <format>] <identifier>

Visualize relationship graph starting from an instance.

Options:
  -d, --depth <n>    Maximum traversal depth (default: 1)
  -f, --format <fmt> Output format: table (default: table)
  -h, --help         Show this help message

Examples:
  ontology graph jdoe
  ontology graph -d 2 team-zulu`);
}
