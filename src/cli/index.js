/**
 * CLI Router - Main entry point for the ontology CLI
 */

import { handleSearch } from './commands/search.js';
import { handleSchema } from './commands/schema.js';
import { handleValidate } from './commands/validate.js';
import { handleGet } from './commands/get.js';
import { handleGraph } from './commands/graph.js';
import { handleDecl } from './commands/decl.js';
import { handleNew } from './commands/new.js';
import { handleLink } from './commands/link.js';
import { handleSet } from './commands/set.js';

const VERSION = '1.1.0';

/**
 * Display help message
 */
function showHelp() {
  console.log(`
ontology - CLI tool for Ontology YAML specification

Usage:
  ontology <command> [options]

T-box Commands (Schema):
  decl cls <class>                         Declare a new class
  decl rel <class> <type> <rel> <class>    Declare a new relation
  decl prop <class> <key>:<type> [...]     Declare properties on a class
  decl qual <rel> <key>:<type> [...]       Declare qualifiers on a relation

A-box Commands (Instances):
  new <id>:<class>                         Create a new instance
  link <from>:<class> <rel> <to>:<class>   Create a relation between instances
  set <id>:<class> <key>=<value> [...]     Set properties on an instance
  get <id>                                 Get instance with its relations

Query Commands:
  search <query>      Search instances using Lucene-like DSL
  graph <id>          Visualize relationship graph from a starting node
  schema list         List all classes and relations
  schema get <name>   Print schema for a class or relation
  validate            Validate instances against schema

Global Options:
  --help, -h          Show this help message
  --verbose           Show detailed output
  --quiet, -q         Suppress output except errors

Examples:
  # T-box (schema) declarations
  ontology decl cls :Person
  ontology decl rel :Person otm :MEMBER_OF :Team
  ontology decl prop :Person name:string required

  # A-box (instance) operations
  ontology new jdoe:Person
  ontology set jdoe:Person name="John Doe"
  ontology link jdoe:Person memberOf team-zulu:Team

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

      case 'decl':
        await handleDecl(commandArgs);
        break;

      case 'new':
        await handleNew(commandArgs);
        break;

      case 'link':
        await handleLink(commandArgs);
        break;

      case 'set':
        await handleSet(commandArgs);
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
