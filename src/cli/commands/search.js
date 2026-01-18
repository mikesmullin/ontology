/**
 * Search Command Handler
 */

import { loadAll } from '../../core/loader.js';
import { tokenize } from '../../query/lexer.js';
import { parse } from '../../query/parser.js';
import { filterAll } from '../../query/evaluator.js';
import { format } from '../../output/formatter.js';

/**
 * Parse search command options
 * @param {string[]} args
 * @returns {{ query: string, options: { verbose: boolean, json: boolean, ids: boolean, count: boolean } }}
 */
function parseArgs(args) {
  const options = {
    verbose: false,
    ids: false,
    count: false
  };
  
  const queryParts = [];
  
  for (const arg of args) {
    if (arg === '-v' || arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--ids') {
      options.ids = true;
    } else if (arg === '-c' || arg === '--count') {
      options.count = true;
    } else if (!arg.startsWith('-')) {
      queryParts.push(arg);
    }
  }
  
  return { query: queryParts.join(' '), options };
}

/**
 * Show search command help
 */
function showHelp() {
  console.log(`
ontology search - Search instances using Lucene-like DSL

Usage:
  ontology search <query> [options]

Options:
  -v, --verbose    Show full YAML output
  --ids            Show only instance IDs
  -c, --count      Show only match count
  --help           Show this help message

Query Syntax:
  field:"value"    Exact match on field
  field:val*       Wildcard match (* = any chars, ? = one char)
  _class:Person    Match instances of a class
  _relation:owns   Match relation instances
  value            Bare search across all fields
  a AND b          Both conditions must match
  a OR b           Either condition matches
  NOT a            Exclude matches
  (a OR b) AND c   Grouping

Examples:
  ontology search "_class:Person"
  ontology search "name:John*"
  ontology search "_class:Person AND active:true"
  ontology search "_relation:memberOf AND _to:team-zulu"
`);
}

/**
 * Handle the search command
 * @param {string[]} args
 */
export async function handleSearch(args) {
  // Check for help flag
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }
  
  const { query, options } = parseArgs(args);
  
  if (!query.trim()) {
    console.error('Error: No query provided.');
    console.error("Usage: ontology search <query>");
    console.error("Run 'ontology search --help' for more information.");
    process.exit(1);
  }
  
  // Load all data
  const data = await loadAll();
  
  // Parse query into AST
  let ast;
  try {
    const tokens = tokenize(query);
    ast = parse(tokens);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    console.error(`  ${query}`);
    console.error(`  ${' '.repeat(error.position || 0)}^`);
    process.exit(1);
  }
  
  // Filter instances
  const matches = filterAll(ast, data.instances);
  
  // Format and output results
  const output = format(matches, options);
  console.log(output);
}
