/**
 * CLI Router - Main entry point for the ontology CLI
 */

import { handleSearch } from './commands/search.js';
import { handleSchema } from './commands/schema.js';
import { handleValidate } from './commands/validate.js';
import { handleGet } from './commands/get.js';
import { handleGraph } from './commands/graph.js';
import { handleLink } from './commands/link.js';
import { handleSet } from './commands/set.js';
import { handleRm } from './commands/rm.js';
import { handleImport } from './commands/import.js';

const VERSION = '1.1.0';

/**
 * Display help message
 */
function showHelp() {
  console.log(`
ontology - CLI tool for Ontology YAML specification

Usage:
  ontology <command> [options]

Primary Command:
  import <file.yaml>                       Import/upsert instances from YAML file

Instance Commands:
  link <from>:<class> <rel> <to>:<class>   Create a relation between instances
  set <id>:<class> <comp>.<key>=<value>    Set component properties on an instance
  rm <id> [<id> ...]                       Remove instances
  get <id>                                 Get instance with its relations

Query Commands:
  search <query>      Search instances using Lucene-like DSL
  graph <id>          Visualize relationship graph from a starting node
  schema list         List all classes, components, and relations
  schema get <name>   Print schema for a class, component, or relation
  validate            Validate instances against schema

Global Options:
  --help, -h          Show this help message
  --db <dir>          Override ontology DB root directory (uses <dir>/storage)
  --verbose           Show detailed output
  --quiet, -q         Suppress output except errors

Examples:
  # Preferred workflow
  ontology import instances.yaml

  # Optional instance mutations
  ontology set jdoe:Person identity.name="John Doe"
  ontology link jdoe:Person memberOf team-zulu:Team
  ontology rm jdoe                        # Remove instance
  ontology rm jdoe pgufler --force         # Remove multiple instances

  # Queries
  ontology search "name=John"
  ontology get jdoe
  ontology graph -d 2 jdoe
`);
}

/**
 * Display version
 */
function showVersion() {
  console.log(`ontology v${VERSION}`);
}

/**
 * Parse global flags from args
 * @param {string[]} args - Command line arguments
 * @returns {{ flags: Set<string>, remaining: string[], dbPath: string | null }}
 */
function parseGlobalFlags(args) {
  const flags = new Set();
  const remaining = [];
  let dbPath = null;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      flags.add('help');
    } else if (arg === '--version' || arg === '-V') {
      flags.add('version');
    } else if (arg === '--db') {
      const next = args[i + 1];
      if (!next || next.startsWith('-')) {
        throw new Error('Global option --db requires a directory path.');
      }
      dbPath = next;
      i += 1;
    } else if (arg.startsWith('--db=')) {
      throw new Error('Global option must use space syntax: --db <dir>.');
    } else {
      remaining.push(arg);
    }
  }

  return { flags, remaining, dbPath };
}

/**
 * Main CLI runner
 * @param {string[]} args - Command line arguments
 */
export async function run(args) {
  const { flags, remaining, dbPath } = parseGlobalFlags(args);

  if (dbPath) {
    process.env.ONTOLOGY_DB = dbPath;
  }

  if (flags.has('version')) {
    showVersion();
    return;
  }

  // Show global help only if no command provided
  if (remaining.length === 0) {
    showHelp();
    return;
  }

  const [command, ...commandArgs] = remaining;

  // Pass --help back to subcommands
  if (flags.has('help')) {
    commandArgs.push('--help');
  }

  try {
    switch (command) {
      case 'search':
        await handleSearch(commandArgs);
        break;

      case 'get':
        await handleGet(commandArgs);
        break;

      case 'graph':
        await handleGraph(commandArgs);
        break;

      case 'schema':
        await handleSchema(commandArgs);
        break;

      case 'validate':
        await handleValidate(commandArgs);
        break;

      case 'link':
        await handleLink(commandArgs);
        break;

      case 'set':
        await handleSet(commandArgs);
        break;

      case 'rm':
        await handleRm(commandArgs);
        break;

      case 'import':
        await handleImport(commandArgs);
        break;

      default:
        console.error(`Error: Unknown command '${command}'`);
        console.error(`Run 'ontology --help' for usage information.`);
        process.exit(1);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}
