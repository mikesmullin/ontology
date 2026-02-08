/**
 * CLI Router - Main entry point for the ontology CLI
 */

import { handleSearch } from './commands/search.js';
import { handleSchema } from './commands/schema.js';
import { handleValidate } from './commands/validate.js';
import { handleGet } from './commands/get.js';
import { handleGraph } from './commands/graph.js';
import { handleDecl } from './commands/decl.js';
import { handleUndecl } from './commands/undecl.js';
import { handleNew } from './commands/new.js';
import { handleLink } from './commands/link.js';
import { handleSet } from './commands/set.js';
import { handleRm } from './commands/rm.js';

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
  decl comp <component> <key>:<type> [...] Declare a new component with properties
  decl cmp <class> <local>:<Component>     Attach components to a class
  decl rel <class> <type> <rel> <class>    Declare a new relation
  decl prop <component> <key>:<type> [...]   Add properties to a component
  decl qual <rel> <key>:<type> [...]       Declare qualifiers on a relation
  undecl cls <class>                       Remove a class from schema
  undecl comp <component>                  Remove a component from schema
  undecl cmp <class> <local>               Remove component attachment from class
  undecl rel <class> <rel> <class>         Remove a relation
  undecl prop <component> <key>            Remove a property from component
  undecl qual <rel> <key>                  Remove a qualifier from relation

A-box Commands (Instances):
  new <id>:<class>                         Create a new instance
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
  --verbose           Show detailed output
  --quiet, -q         Suppress output except errors

Examples:
  # T-box (schema) declarations
  ontology decl cls :Person
  ontology decl comp :Identity givenName:string surname:string name:string
  ontology decl rel :Person otm :MEMBER_OF :Team

  # Remove schema elements
  ontology undecl cls Location                   # Remove Location class
  ontology undecl rel :Process mto :RUNS_ON :Location  # Remove relation

  # A-box (instance) operations
  ontology new jdoe:Person
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

      case 'undecl':
        await handleUndecl(commandArgs);
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

      case 'rm':
        await handleRm(commandArgs);
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
