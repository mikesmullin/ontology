/**
 * Get Command Handler - Retrieve a specific instance by ID
 * Also supports getting class schemas with properties and relations
 */

import { loadAll, loadSchema } from '../../core/loader.js';
import yaml from 'js-yaml';

/**
 * Show get command help
 */
function showHelp() {
  console.log(`
ontology get - Get instance data or class schema

Usage:
  ontology get <identifier> [options]
  ontology get cls [<class>] [comp] [rel] [...]

Instance Mode:
  ontology get <id>              Get instance by ID with its relations

Class Schema Mode:
  ontology get cls                         List all class identifiers
  ontology get cls <class>                 Print class schema with all components/rels
  ontology get cls <class> comp            Print class with components only
  ontology get cls <class> comp identity   Print specific component local names
  ontology get cls <class> rel             Print class with relations only
  ontology get cls <class> rel memberOf    Print specific relations

Relation Schema Mode:
  ontology get rel                         List all relation identifiers
  ontology get rel [relN...]               Print specific relation schemas

Component Schema Mode:
  ontology get comp                        List all component class names
  ontology get comp <component>            Print component schema with properties

Options:
  --help           Show this help message
  --verbose        Show detailed output
  --quiet          Suppress output except errors

Examples:
  ontology get jdoe              # Get Person:jdoe instance
  ontology get cls               # List all class names
  ontology get cls Person        # Get Person class schema (with components)
  ontology get comp Identity     # Get Identity component schema
  ontology get rel memberOf      # Get memberOf relation schema
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
  delete copy._class;
  delete copy._id;
  return yaml.dump(copy, { lineWidth: -1, noRefs: true }).trimEnd();
}

/**
 * Format cardinality code from schema
 * @param {any} cardinality
 * @returns {string}
 */
function formatCardinalityCode(cardinality) {
  if (typeof cardinality === 'string') {
    return cardinality;
  }
  const min = cardinality?.min ?? 0;
  const max = cardinality?.max ?? 'many';
  
  if (min === 1 && max === 1) return 'oto';
  if (min === 1 && max === 'many') return 'otm';
  if (min === 0 && max === 1) return 'mto';
  return 'mtm';
}

/**
 * Format relation for display in new format
 * @param {Object} relation
 * @param {Object} schema
 * @param {Map<string, Object>} instancesById
 * @returns {string}
 */
function formatRelationLine(relation, schema, instancesById) {
  const fromInstance = instancesById.get(relation._from);
  const toInstance = instancesById.get(relation._to);
  
  const fromClass = fromInstance?._class || '?';
  const toClass = toInstance?._class || '?';
  
  const relSchema = schema.relations[relation._relation];
  const card = relSchema ? formatCardinalityCode(relSchema.cardinality) : 'mtm';
  
  // Get qualifiers
  const qualifiers = Object.entries(relation)
    .filter(([k]) => !k.startsWith('_'))
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(' ');
  
  const qualStr = qualifiers ? ` ${qualifiers}` : '';
  
  return `${relation._from}:${fromClass} ${card} :${relation._relation} ${relation._to}:${toClass}${qualStr}`;
}

/**
 * Format cardinality for display (using code format)
 * @param {any} cardinality
 * @returns {string}
 */
function formatCardinality(cardinality) {
  if (typeof cardinality === 'string') {
    return cardinality;
  }
  const min = cardinality?.min ?? 0;
  const max = cardinality?.max ?? 'many';
  
  if (min === 1 && max === 1) return 'oto';
  if (min === 1 && max === 'many') return 'otm';
  if (min === 0 && max === 1) return 'mto';
  return 'mtm';
}

/**
 * Handle get cls subcommand
 * @param {string[]} args
 * @param {Object} options
 */
async function handleGetClass(args, options) {
  const schema = await loadSchema();
  
  // No class specified - list all class identifiers
  if (args.length === 0) {
    const classNames = Object.keys(schema.classes);
    if (classNames.length === 0) {
      console.log('(no classes defined)');
    } else {
      for (const name of classNames) {
        console.log(name);
      }
    }
    return;
  }
  
  const className = args[0];
  const classDef = schema.classes[className];
  
  if (!classDef) {
    console.error(`Error: Class '${className}' not found.`);
    process.exit(1);
  }
  
  // Parse what to show
  const showAll = args.length === 1;
  const compIndex = args.indexOf('comp');
  const relIndex = args.indexOf('rel');
  
  let showComps = showAll || compIndex !== -1;
  let showRels = showAll || relIndex !== -1;
  
  // Get specific components/rels to show
  let specificComps = [];
  let specificRels = [];
  
  if (compIndex !== -1) {
    // Get all args after 'comp' until 'rel' or end
    const endIndex = relIndex !== -1 && relIndex > compIndex ? relIndex : args.length;
    specificComps = args.slice(compIndex + 1, endIndex);
  }
  
  if (relIndex !== -1) {
    // Get all args after 'rel' until end
    specificRels = args.slice(relIndex + 1);
  }
  
  console.log(`Class: ${className}`);
  
  if (showComps) {
    console.log('');
    console.log('Components:');
    const comps = classDef.components || {};
    const compNames = specificComps.length > 0 ? specificComps : Object.keys(comps);
    
    if (compNames.length === 0 || Object.keys(comps).length === 0) {
      console.log('  (no components defined)');
    } else {
      for (const localName of compNames) {
        const componentClass = comps[localName];
        if (componentClass) {
          console.log(`  ${localName}: ${componentClass}`);
          // Show properties from the component class
          const compDef = schema.components?.[componentClass];
          if (compDef?.properties) {
            for (const [propName, propDef] of Object.entries(compDef.properties)) {
              const required = propDef.required ? ' (required)' : '';
              console.log(`    .${propName}: ${propDef.type}${required}`);
            }
          }
        } else {
          console.log(`  ${localName}: (not defined)`);
        }
      }
    }
  }
  
  if (showRels) {
    console.log('');
    console.log('Relations (as domain):');
    
    const relNames = specificRels.length > 0 ? specificRels : Object.keys(schema.relations);
    const asDomain = [];
    const asRange = [];
    
    for (const relName of relNames) {
      const rel = schema.relations[relName];
      if (!rel) continue;
      if (rel.domain === className) {
        asDomain.push({ name: relName, ...rel });
      }
      if (specificRels.length === 0 && rel.range === className) {
        asRange.push({ name: relName, ...rel });
      }
    }
    
    if (asDomain.length === 0) {
      console.log('  (none)');
    } else {
      for (const rel of asDomain) {
        const card = formatCardinality(rel.cardinality);
        console.log(`  :${className} ${card} :${rel.name.toUpperCase()} :${rel.range}`);
      }
    }
    
    if (specificRels.length === 0) {
      console.log('');
      console.log('Relations (as range):');
      if (asRange.length === 0) {
        console.log('  (none)');
      } else {
        for (const rel of asRange) {
          const card = formatCardinality(rel.cardinality);
          console.log(`  :${rel.domain} ${card} :${rel.name.toUpperCase()} :${className}`);
        }
      }
    }
  }
}

/**
 * Handle get rel subcommand
 * @param {string[]} args
 * @param {Object} options
 */
async function handleGetRelation(args, options) {
  const schema = await loadSchema();
  
  // No relation specified - list all relation identifiers
  if (args.length === 0) {
    const relNames = Object.keys(schema.relations);
    if (relNames.length === 0) {
      console.log('(no relations defined)');
    } else {
      for (const name of relNames) {
        console.log(name);
      }
    }
    return;
  }
  
  // Print specific relations
  for (const relName of args) {
    const rel = schema.relations[relName];
    
    if (!rel) {
      console.error(`Error: Relation '${relName}' not found.`);
      continue;
    }
    
    console.log(`Relation: ${relName}`);
    console.log(`  :${rel.domain} ${formatCardinality(rel.cardinality)} :${relName.toUpperCase()} :${rel.range}`);
    
    if (rel.qualifiers && Object.keys(rel.qualifiers).length > 0) {
      console.log('  Qualifiers:');
      for (const [qName, qDef] of Object.entries(rel.qualifiers)) {
        const required = qDef.required ? ' (required)' : '';
        console.log(`    ${qName}: ${qDef.type}${required}`);
      }
    }
    console.log('');
  }
}

/**
 * Handle get comp subcommand
 * @param {string[]} args
 * @param {Object} options
 */
async function handleGetComponent(args, options) {
  const schema = await loadSchema();
  
  // No component specified - list all component class names
  if (args.length === 0) {
    const compNames = Object.keys(schema.components || {});
    if (compNames.length === 0) {
      console.log('(no components defined)');
    } else {
      for (const name of compNames) {
        console.log(name);
      }
    }
    return;
  }
  
  // Print specific components
  for (const compName of args) {
    const comp = schema.components?.[compName];
    
    if (!comp) {
      console.error(`Error: Component '${compName}' not found.`);
      continue;
    }
    
    console.log(`Component: ${compName}`);
    console.log('Properties:');
    const props = comp.properties || {};
    if (Object.keys(props).length === 0) {
      console.log('  (no properties defined)');
    } else {
      for (const [propName, propDef] of Object.entries(props)) {
        const required = propDef.required ? ' (required)' : '';
        console.log(`  ${propName}: ${propDef.type}${required}`);
      }
    }
    console.log('');
  }
}

/**
 * Handle get instance subcommand
 * @param {string} identifier
 * @param {Object} options
 */
async function handleGetInstance(identifier, options) {
  const data = await loadAll();

  // Find the instance
  const instance = data.instances.classes.find(i => i._id === identifier);

  if (!instance) {
    console.error(`Error: No instance found with _id '${identifier}'`);
    process.exit(1);
  }

  // Build instances map for relation formatting
  const instancesById = new Map();
  for (const inst of data.instances.classes) {
    instancesById.set(inst._id, inst);
  }

  // Find outgoing relations (where this instance is _from)
  const outgoing = data.instances.relations.filter(r => r._from === identifier);

  // Find incoming relations (where this instance is _to)
  const incoming = data.instances.relations.filter(r => r._to === identifier);

  // Print instance header
  console.log(`Class ${instance._id}:${instance._class} # Source: ${instance._source}`);
  console.log('');
  
  // Print instance properties (without _class, _id, etc.)
  const propsOutput = formatInstance(instance);
  if (propsOutput && propsOutput !== '{}') {
    console.log('Properties:');
    // Indent each line of propsOutput
    const indentedProps = propsOutput.split('\n').map(line => `  ${line}`).join('\n');
    console.log(indentedProps);
  }

  // Print outgoing relations
  if (outgoing.length > 0) {
    console.log('');
    console.log('Relations (as domain):');
    for (const rel of outgoing) {
      console.log(`  ${formatRelationLine(rel, data.schema, instancesById)}`);
    }
  }

  // Print incoming relations
  if (incoming.length > 0) {
    console.log('');
    console.log('Relations (as range):');
    for (const rel of incoming) {
      console.log(`  ${formatRelationLine(rel, data.schema, instancesById)}`);
    }
  }
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

  const options = {
    verbose: args.includes('--verbose'),
    quiet: args.includes('--quiet') || args.includes('-q')
  };

  // Filter out flags
  const cleanArgs = args.filter(a => !a.startsWith('-'));
  const [firstArg, ...restArgs] = cleanArgs;

  if (!firstArg) {
    console.error('Error: No identifier provided.');
    console.error('Usage: ontology get <identifier>');
    process.exit(1);
  }

  // Check for subcommands
  if (firstArg === 'cls') {
    await handleGetClass(restArgs, options);
    return;
  }

  if (firstArg === 'rel') {
    await handleGetRelation(restArgs, options);
    return;
  }

  if (firstArg === 'comp') {
    await handleGetComponent(restArgs, options);
    return;
  }

  // Default: get instance
  await handleGetInstance(firstArg, options);
}
