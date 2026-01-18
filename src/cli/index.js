/**
 * CLI Router - Main entry point for the ontology CLI
 */

import { handleSearch } from './commands/search.js';
import { handleSchema } from './commands/schema.js';
import { handleValidate } from './commands/validate.js';
import { handleGet } from './commands/get.js';
import { handleGraph } from './commands/graph.js';

const VERSION = '1.0.0';

/**
 * Display help message
 */
function showHelp() {
  console.log(`
ontology - CLI tool for Ontology YAML specification

Usage:
  ontology <command> [options]

Commands:
  search <query>      Search instances in storage/*.yml using Lucene-like DSL
  get <id>            Get a specific instance by ID with its relations
  graph <id>          Visualize relationship graph from a starting node
  schema list         List all classes and relations defined in schema
  schema get <name>   Print schema for a specific class or relation
  validate            Validate instances against schema

Global Options:
  --help, -h          Show this help message
  --version, -V       Show version number

Examples:
  ontology search "_class:Person"
  ontology search "name:John*"
  ontology get jdoe
  ontology graph -d 2 jdoe
  ontology schema list
  ontology schema get Person
  ontology validate

For more information, see docs/PLAN.md
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
 * @returns {{ flags: Set<string>, remaining: string[] }}
 */
function parseGlobalFlags(args) {
  const flags = new Set();
  const remaining = [];

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      flags.add('help');
    } else if (arg === '--version' || arg === '-V') {
      flags.add('version');
    } else {
      remaining.push(arg);
    }
  }

  return { flags, remaining };
}

/**
 * Main CLI runner
 * @param {string[]} args - Command line arguments
 */
export async function run(args) {
  const { flags, remaining } = parseGlobalFlags(args);

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
