/**
 * Schema Command Handler
 */

import { loadSchema, loadAll } from '../../core/loader.js';

/**
 * Format cardinality for display
 * @param {string} cardinality - Cardinality code (oto, otm, mto, mtm)
 * @returns {string}
 */
function formatCardinality(cardinality) {
  switch (cardinality) {
    case 'oto': return '[1..1]';
    case 'otm': return '[1..*]';
    case 'mto': return '[*..1]';
    case 'mtm': return '[*..*]';
    default: return `[${cardinality}]`;
  }
}

/**
 * Format cardinality as text description
 * @param {string} cardinality - Cardinality code (oto, otm, mto, mtm)
 * @returns {string}
 */
function formatCardinalityText(cardinality) {
  switch (cardinality) {
    case 'oto': return 'required, exactly one';
    case 'otm': return 'required, unbounded';
    case 'mto': return 'optional, at most one';
    case 'mtm': return 'optional, unbounded';
    default: return cardinality;
  }
}

/**
 * Print schema list in tree format
 * @param {{ classes: Record<string, any>, relations: Record<string, any>, namespaces: Set<string> }} schema
 * @param {string | null} namespace
 */
function printSchemaTree(schema, namespace) {
  const ns = namespace || [...schema.namespaces][0] || 'default';
  
  console.log(`Namespace: ${ns}`);
  console.log('');
  console.log('Classes:');
  
  const classNames = Object.keys(schema.classes);
  if (classNames.length === 0) {
    console.log('  (no classes defined)');
  } else {
    for (const className of classNames) {
      console.log(`  ${className}`);
      const classDef = schema.classes[className];
      const props = classDef?.properties || {};
      const propNames = Object.keys(props);
      
      if (propNames.length === 0) {
        console.log('    (no properties defined)');
      } else {
        propNames.forEach((propName, i) => {
          const prop = props[propName];
          const prefix = i === propNames.length - 1 ? '└──' : '├──';
          const required = prop.required ? ' (required)' : '';
          console.log(`    ${prefix} ${propName}: ${prop.type}${required}`);
        });
      }
    }
  }
  
  console.log('');
  console.log('Relations:');
  
  const relationNames = Object.keys(schema.relations);
  if (relationNames.length === 0) {
    console.log('  (no relations defined)');
  } else {
    for (const relName of relationNames) {
      const rel = schema.relations[relName];
      const card = rel.cardinality || 'mtm';
      let line = `  :${rel.domain} ${card} :${relName} :${rel.range}`;
      
      if (rel.qualifiers) {
        const qualNames = Object.keys(rel.qualifiers);
        if (qualNames.length > 0) {
          const qualStr = qualNames.map(q => `${q}:${rel.qualifiers[q].type}`).join(', ');
          line += ` [${qualStr}]`;
        }
      }
      console.log(line);
    }
  }
}

/**
 * Print schema list as JSON
 * @param {{ classes: Record<string, any>, relations: Record<string, any>, namespaces: Set<string> }} schema
 * @param {string | null} namespace
 */
function printSchemaJson(schema, namespace) {
  const ns = namespace || [...schema.namespaces][0] || 'default';
  
  const output = {
    namespace: ns,
    classes: schema.classes,
    relations: schema.relations
  };
  
  console.log(JSON.stringify(output, null, 2));
}

/**
 * Handle schema list command
 * @param {string[]} args
 */
async function handleSchemaList(args) {
  let namespace = null;
  
  const nsIndex = args.findIndex(a => a === '-n' || a === '--namespace');
  if (nsIndex !== -1 && args[nsIndex + 1]) {
    namespace = args[nsIndex + 1];
  }
  
  const schema = await loadSchema();
  printSchemaTree(schema, namespace);
}

/**
 * Get class definition with related relations
 * @param {string} name
 * @param {{ classes: Record<string, any>, relations: Record<string, any>, namespaces: Set<string> }} schema
 */
function getClassDetails(name, schema) {
  const classDef = schema.classes[name];
  if (!classDef) return null;
  
  const relationsAsDomain = [];
  const relationsAsRange = [];
  
  for (const [relName, rel] of Object.entries(schema.relations)) {
    if (rel.domain === name) {
      relationsAsDomain.push({ name: relName, ...rel });
    }
    if (rel.range === name) {
      relationsAsRange.push({ name: relName, ...rel });
    }
  }
  
  return {
    type: 'class',
    name,
    properties: classDef.properties || {},
    relationsAsDomain,
    relationsAsRange
  };
}

/**
 * Get relation definition
 * @param {string} name
 * @param {{ classes: Record<string, any>, relations: Record<string, any>, namespaces: Set<string> }} schema
 */
function getRelationDetails(name, schema) {
  const rel = schema.relations[name];
  if (!rel) return null;
  
  return {
    type: 'relation',
    name,
    ...rel
  };
}

/**
 * Print class details in tree format
 * @param {Object} details
 * @param {string} namespace
 */
function printClassTree(details, namespace) {
  console.log(`Class: ${details.name}`);
  console.log(`Namespace: ${namespace}`);
  console.log('');
  console.log('Properties:');
  
  const props = details.properties;
  const propNames = Object.keys(props);
  
  if (propNames.length === 0) {
    console.log('  (no properties defined)');
  } else {
    propNames.forEach((propName, i) => {
      const prop = props[propName];
      const prefix = i === propNames.length - 1 ? '└──' : '├──';
      const required = prop.required ? ' (required)' : '';
      console.log(`  ${prefix} ${propName}: ${prop.type}${required}`);
    });
  }
  
  console.log('');
  console.log('Relations (as domain):');
  if (details.relationsAsDomain.length === 0) {
    console.log('  (none)');
  } else {
    details.relationsAsDomain.forEach((rel, i) => {
      const prefix = i === details.relationsAsDomain.length - 1 ? '└──' : '├──';
      const card = formatCardinality(rel.cardinality);
      console.log(`  ${prefix} ${rel.name} → ${rel.range} ${card}`);
    });
  }
  
  console.log('');
  console.log('Relations (as range):');
  if (details.relationsAsRange.length === 0) {
    console.log('  (none)');
  } else {
    details.relationsAsRange.forEach((rel, i) => {
      const prefix = i === details.relationsAsRange.length - 1 ? '└──' : '├──';
      const card = formatCardinality(rel.cardinality);
      console.log(`  ${prefix} ${rel.name} ← ${rel.domain} ${card}`);
    });
  }
}

/**
 * Print relation details in tree format
 * @param {Object} details
 * @param {string} namespace
 */
function printRelationTree(details, namespace) {
  console.log(`Relation: ${details.name}`);
  console.log(`Namespace: ${namespace}`);
  console.log('');
  console.log(`  ${details.domain} → ${details.range} ${formatCardinality(details.cardinality)}`);
  console.log('');
  console.log(`Cardinality: ${details.cardinality.min}..${details.cardinality.max === 'many' ? 'many' : details.cardinality.max} (${formatCardinalityText(details.cardinality)})`);
  
  console.log('Qualifiers:');
  if (!details.qualifiers || Object.keys(details.qualifiers).length === 0) {
    console.log('  (none)');
  } else {
    const qualNames = Object.keys(details.qualifiers);
    qualNames.forEach((qualName, i) => {
      const qual = details.qualifiers[qualName];
      const prefix = i === qualNames.length - 1 ? '└──' : '├──';
      console.log(`  ${prefix} ${qualName}: ${qual.type}`);
    });
  }
}

/**
 * Print details as JSON
 * @param {Object} details
 * @param {string} namespace
 */
function printDetailsJson(details, namespace) {
  const output = {
    ...details,
    namespace
  };
  console.log(JSON.stringify(output, null, 2));
}

/**
 * Handle schema get command
 * @param {string[]} args
 */
async function handleSchemaGet(args) {
  const json = args.includes('--json');
  const name = args.find(a => !a.startsWith('-'));
  
  let namespace = null;
  const nsIndex = args.findIndex(a => a === '-n' || a === '--namespace');
  if (nsIndex !== -1 && args[nsIndex + 1]) {
    namespace = args[nsIndex + 1];
  }
  
  if (!name) {
    console.error('Error: No class or relation name provided.');
    console.error('Usage: ontology schema get <name>');
    process.exit(1);
  }
  
  const schema = await loadSchema();
  const ns = namespace || [...schema.namespaces][0] || 'default';
  
  // Try to find as class first, then as relation
  let details = getClassDetails(name, schema);
  if (!details) {
    details = getRelationDetails(name, schema);
  }
  
  if (!details) {
    console.error(`Error: No class or relation named '${name}' found.`);
    process.exit(1);
  }
  
  if (json) {
    printDetailsJson(details, ns);
  } else if (details.type === 'class') {
    printClassTree(details, ns);
  } else {
    printRelationTree(details, ns);
  }
}

/**
 * Show schema command help
 */
function showHelp() {
  console.log(`
ontology schema - Manage schema definitions

Usage:
  ontology schema <subcommand> [options]

Subcommands:
  list              List all classes and relations
  get <name>        Get details for a specific class or relation

Options:
  -n, --namespace   Filter by namespace
  --help            Show this help message

Examples:
  ontology schema list
  ontology schema get Person
  ontology schema get memberOf
`);
}

/**
 * Handle schema commands
 * @param {string[]} args
 */
export async function handleSchema(args) {
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    showHelp();
    return;
  }
  
  const [subcommand, ...subArgs] = args;
  
  switch (subcommand) {
    case 'list':
      await handleSchemaList(subArgs);
      break;
      
    case 'get':
      await handleSchemaGet(subArgs);
      break;
      
    default:
      console.error(`Error: Unknown schema subcommand '${subcommand}'`);
      console.error("Run 'ontology schema --help' for usage information.");
      process.exit(1);
  }
}
