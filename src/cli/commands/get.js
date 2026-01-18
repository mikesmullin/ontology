/**
 * Get Command Handler - Retrieve a specific instance by ID
 */

import { loadAll } from '../../core/loader.js';
import { stringify } from 'yaml';

/**
 * Show get command help
 */
function showHelp() {
  console.log(`
ontology get - Get a specific instance by ID

Usage:
  ontology get <identifier> [options]

Arguments:
  <identifier>     Instance ID (e.g., jdoe, team-zulu)

Options:
  --help           Show this help message

Description:
  Retrieves a specific class instance by its _id and prints its spec
  along with all relationships (both outgoing and incoming).

Examples:
  ontology get jdoe
  ontology get team-zulu
`);
}

/**
 * Format instance for display
 * @param {Object} instance
 * @returns {string}
 */
function formatInstance(instance) {
  const copy = { ...instance };
  delete copy._namespace;
  delete copy._source;
  return stringify(copy).trimEnd();
}

/**
 * Format relation for display
 * @param {Object} relation
 * @param {string} direction - 'outgoing' or 'incoming'
 * @returns {string}
 */
function formatRelation(relation, direction) {
  const copy = { ...relation };
  delete copy._namespace;
  delete copy._source;
  
  const arrow = direction === 'outgoing' 
    ? `${relation._from} —[${relation._relation}]→ ${relation._to}`
    : `${relation._from} —[${relation._relation}]→ ${relation._to}`;
  
  // Get qualifiers
  const qualifiers = Object.entries(relation)
    .filter(([k]) => !k.startsWith('_'))
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
  
  return qualifiers ? `${arrow} (${qualifiers})` : arrow;
}

/**
 * Handle the get command
 * @param {string[]} args
 */
export async function handleGet(args) {
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    showHelp();
    return;
  }

  const identifier = args.find(a => !a.startsWith('-'));

  if (!identifier) {
    console.error('Error: No identifier provided.');
    console.error('Usage: ontology get <identifier>');
    process.exit(1);
  }

  const data = await loadAll();

  // Find the instance
  const instance = data.instances.classes.find(i => i._id === identifier);

  if (!instance) {
    console.error(`Error: No instance found with _id '${identifier}'`);
    process.exit(1);
  }

  // Find outgoing relations (where this instance is _from)
  const outgoing = data.instances.relations.filter(r => r._from === identifier);

  // Find incoming relations (where this instance is _to)
  const incoming = data.instances.relations.filter(r => r._to === identifier);

  // Print instance
  console.log(`# ${instance._class}:${instance._id}`);
  console.log(`# Source: ${instance._source}`);
  console.log('');
  console.log(formatInstance(instance));

  // Print outgoing relations
  if (outgoing.length > 0) {
    console.log('');
    console.log('# Outgoing Relations:');
    for (const rel of outgoing) {
      console.log(`#   ${formatRelation(rel, 'outgoing')}`);
    }
  }

  // Print incoming relations
  if (incoming.length > 0) {
    console.log('');
    console.log('# Incoming Relations:');
    for (const rel of incoming) {
      console.log(`#   ${formatRelation(rel, 'incoming')}`);
    }
  }
}
