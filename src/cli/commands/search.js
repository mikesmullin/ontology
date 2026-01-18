/**
 * Search Command Handler
 */

import { loadAll } from '../../core/loader.js';
import { tokenize } from '../../query/lexer.js';
import { parse } from '../../query/parser.js';
import { findMatches } from '../../query/evaluator.js';
import { formatSearchResults } from '../../output/formatter.js';

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
    } else {
      // Include all other args in query (including those starting with -)
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
ontology search - Search instances using grep-like DSL

Usage:
  ontology search <query> [options]

Options:
  -v, --verbose    Show full YAML output
  --ids            Show only instance IDs
  -c, --count      Show only match count
  --help           Show this help message

Class Property Search Syntax:
  <value>                    Search all properties for value (contains)
  :Class: <value>            Search Class instances for value
  :Class.property: <value>   Search Class.property for value
  id:Class.property: <value> Search specific instance's property
  id:: <value>               Search specific instance's all properties
  :Class.property:           List all values of Class.property

Relation Search Syntax:
  -[:RELATION]->                 Find all RELATION relations
  -[:RELATION].qualifier->       Find RELATIONs with qualifier
  -[:RELATION]->: <target>       Find RELATIONs to target (contains)
  -[:RELATION].qual->: <value>   Find RELATIONs with qualifier value
  (id)-[:RELATION]->             Find relations from specific instance
  (id:Class)-[:RELATION]->       Find relations from Class instance
  (:Class)-[:RELATION]->         Find relations from any Class instance

Boolean Operators:
  AND                        Both conditions must match
  OR                         Either condition matches
  NOT                        Exclude matches
  ( ... )                    Grouping

Output Format:
  Class properties:
    <file>:<line>:<id>:<Class>.<property>: <value>
  Relations:
    <file>:<line>: <from>:<Class> :<RELATION> <to>:<Class> [qualifier="value"]

Examples:
  ontology search John
  ontology search ":Person: John"
  ontology search ":Person.name: John"
  ontology search "jdoe:Person.email:"
  ontology search "-[:MEMBER_OF]->"
  ontology search "(team-zulu:Team)-[:OWNS]->"
  ontology search "(:Team)-[:OWNS].role->: owner"
  ontology search "NOT John AND (:Team)-[:OWNS].role->: owner"
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
  
  // Find matches
  const results = findMatches(ast, data.instances);
  
  // Format and output results
  const output = formatSearchResults(results, options);
  console.log(output);
}
