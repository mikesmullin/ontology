/**
 * Undecl Command Handler - Remove T-box schema elements (classes, relations, properties, qualifiers)
 */

import { loadAll, getStoragePath } from '../../core/loader.js';
import { safeWrite } from '../../core/safe-write.js';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { parseStorageFileContent, serializeStorageFileContent } from '../../core/storage-file.js';

/**
 * Show undecl command help
 */
function showHelp() {
  console.log(`
ontology undecl - Remove schema elements (T-box)

Usage:
  ontology undecl <subcommand> [options]

Subcommands:
  cls <class>                              Remove a class from schema
  comp <component>                         Remove a component from schema
  cmp <class> <local>                      Remove component attachment from a class
  rel <from_class> <relation> <to_class>   Remove a relation
  prop <component> <key>                   Remove a property from component
  qual <rel> <key>                         Remove a qualifier from relation

Options:
  --help      Show this help message
  --verbose   Show detailed output
  --quiet     Suppress output except errors

Examples:
  # Remove schema elements
  ontology undecl cls Location                   # Remove Location class
  ontology undecl cls Process                    # Remove Process class
  ontology undecl comp LocationInfo              # Remove LocationInfo component
  ontology undecl rel Service DEPLOYED_TO Cloud # Remove relation
  ontology undecl prop LocationInfo hostname     # Remove property from component
`);
}

/**
 * Parse class name (strips leading colon)
 * @param {string} name
 * @returns {string}
 */
function parseClassName(name) {
  if (name.startsWith(':')) {
    return name.slice(1);
  }
  return name;
}

/**
 * Find the schema file in loaded data
 * @param {Object} data - Loaded ontology data
 * @returns {Promise<string>} - Path to schema file
 */
async function findSchemaFile(data) {
  const storagePath = getStoragePath();
  
  // Look for existing schema file (file that has a schema: section)
  for (const { source, document } of data.rawDocuments || []) {
    if (document.schema) {
      return join(storagePath, '..', source);
    }
  }
  
  // Default schema file
  return join(storagePath, 'org-stormy.md');
}

/**
 * Load and parse a YAML file
 * @param {string} filePath
 * @returns {Promise<Object>}
 */
async function loadYamlFile(filePath) {
  const content = await readFile(filePath, 'utf-8');
  const { docs, body } = parseStorageFileContent(filePath, content);
  return { parsed: docs[0] || {}, body };
}

/**
 * Handle the undecl command
 * @param {string[]} args
 */
export async function handleUndecl(args) {
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    showHelp();
    return;
  }

  const options = {
    verbose: args.includes('--verbose'),
    quiet: args.includes('--quiet') || args.includes('-q')
  };

  const cleanArgs = args.filter(a => !a.startsWith('-'));
  const [subcommand, ...subArgs] = cleanArgs;

  try {
    const data = await loadAll();

    switch (subcommand) {
      case 'cls':
        await undelClass(data, subArgs, options);
        break;

      case 'comp':
        await undelComponent(data, subArgs, options);
        break;

      case 'cmp':
        await undelClassComponent(data, subArgs, options);
        break;

      case 'rel':
        await undelRelation(data, subArgs, options);
        break;

      case 'prop':
        await undelProperty(data, subArgs, options);
        break;

      case 'qual':
        await undelQualifier(data, subArgs, options);
        break;

      default:
        console.error(`Error: Unknown subcommand '${subcommand}'`);
        console.error(`Run 'ontology undecl --help' for usage.`);
        process.exit(1);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Remove a class from schema
 */
async function undelClass(data, args, options) {
  if (args.length === 0) {
    throw new Error('undecl cls requires a class name');
  }

  const className = parseClassName(args[0]);
  
  if (!data.schema.classes[className]) {
    throw new Error(`Class '${className}' not found in schema`);
  }

  // Check for relations that reference this class
  const relatedRels = [];
  for (const [relName, relDef] of Object.entries(data.schema.relations)) {
    if (relDef.domain === className || relDef.range === className) {
      relatedRels.push(relName);
    }
  }

  const schemaFilePath = await findSchemaFile(data);
  const { parsed, body } = await loadYamlFile(schemaFilePath);

  // Remove the class
  if (parsed.schema.classes[className]) {
    delete parsed.schema.classes[className];
  }

  // Also remove related relations
  if (relatedRels.length > 0 && parsed.schema.relations) {
    for (const relName of relatedRels) {
      delete parsed.schema.relations[relName];
      if (!options.quiet) {
        console.log(`  Also removed relation: ${relName}`);
      }
    }
  }

  const newContent = serializeStorageFileContent(schemaFilePath, [parsed], { body });
  const result = await safeWrite(schemaFilePath, newContent);

  if (!result.valid) {
    console.error('Validation failed after removing class:');
    for (const err of result.errors) {
      console.error(`  ✗ ${err.message}`);
    }
    process.exit(1);
  }

  if (!options.quiet) {
    console.log(`Removed class: ${className}`);
  }
}

/**
 * Remove a component from schema
 */
async function undelComponent(data, args, options) {
  if (args.length === 0) {
    throw new Error('undecl comp requires a component name');
  }

  const compName = args[0];

  if (!data.schema.components[compName]) {
    throw new Error(`Component '${compName}' not found in schema`);
  }

  // Check if component is used by any class
  for (const [className, classDef] of Object.entries(data.schema.classes)) {
    if (classDef.components && Object.values(classDef.components).includes(compName)) {
      throw new Error(`Cannot remove component '${compName}': used by class '${className}'`);
    }
  }

  const schemaFilePath = await findSchemaFile(data);
  const { parsed, body } = await loadYamlFile(schemaFilePath);

  if (parsed.schema.components[compName]) {
    delete parsed.schema.components[compName];
  }

  const newContent = serializeStorageFileContent(schemaFilePath, [parsed], { body });
  const result = await safeWrite(schemaFilePath, newContent);

  if (!result.valid) {
    console.error('Validation failed after removing component:');
    for (const err of result.errors) {
      console.error(`  ✗ ${err.message}`);
    }
    process.exit(1);
  }

  if (!options.quiet) {
    console.log(`Removed component: ${compName}`);
  }
}

/**
 * Remove component from class
 */
async function undelClassComponent(data, args, options) {
  if (args.length < 2) {
    throw new Error('undecl cmp requires class name and local component name');
  }

  const className = parseClassName(args[0]);
  const localName = args[1];

  if (!data.schema.classes[className]) {
    throw new Error(`Class '${className}' not found`);
  }

  const classDef = data.schema.classes[className];
  if (!classDef.components || !classDef.components[localName]) {
    throw new Error(`Component mapping '${localName}' not found in class '${className}'`);
  }

  const schemaFilePath = await findSchemaFile(data);
  const { parsed, body } = await loadYamlFile(schemaFilePath);

  if (parsed.schema.classes[className]?.components[localName]) {
    delete parsed.schema.classes[className].components[localName];
    if (Object.keys(parsed.schema.classes[className].components).length === 0) {
      delete parsed.schema.classes[className].components;
    }
  }

  const newContent = serializeStorageFileContent(schemaFilePath, [parsed], { body });
  const result = await safeWrite(schemaFilePath, newContent);

  if (!result.valid) {
    console.error('Validation failed:');
    for (const err of result.errors) {
      console.error(`  ✗ ${err.message}`);
    }
    process.exit(1);
  }

  if (!options.quiet) {
    console.log(`Removed component mapping '${localName}' from class '${className}'`);
  }
}

/**
 * Remove a relation from schema
 */
async function undelRelation(data, args, options) {
  if (args.length < 3) {
    throw new Error('undecl rel requires: from_class relation to_class');
  }

  const fromClass = parseClassName(args[0]);
  const relName = parseClassName(args[1]);
  const toClass = parseClassName(args[2]);

  if (!data.schema.relations[relName]) {
    throw new Error(`Relation '${relName}' not found`);
  }

  const relDef = data.schema.relations[relName];
  if (relDef.domain !== fromClass || relDef.range !== toClass) {
    throw new Error(`Relation '${relName}' does not match domain ${fromClass} -> ${toClass}`);
  }

  const schemaFilePath = await findSchemaFile(data);
  const { parsed, body } = await loadYamlFile(schemaFilePath);

  if (parsed.schema.relations[relName]) {
    delete parsed.schema.relations[relName];
  }

  const newContent = serializeStorageFileContent(schemaFilePath, [parsed], { body });
  const result = await safeWrite(schemaFilePath, newContent);

  if (!result.valid) {
    console.error('Validation failed:');
    for (const err of result.errors) {
      console.error(`  ✗ ${err.message}`);
    }
    process.exit(1);
  }

  if (!options.quiet) {
    console.log(`Removed relation: ${relName}`);
  }
}

/**
 * Remove a property from component
 */
async function undelProperty(data, args, options) {
  if (args.length < 2) {
    throw new Error('undecl prop requires component name and property key');
  }

  const compName = args[0];
  const propKey = args[1];

  if (!data.schema.components[compName]) {
    throw new Error(`Component '${compName}' not found`);
  }

  const comp = data.schema.components[compName];
  if (!comp.properties || !comp.properties[propKey]) {
    throw new Error(`Property '${propKey}' not found in component '${compName}'`);
  }

  const schemaFilePath = await findSchemaFile(data);
  const { parsed, body } = await loadYamlFile(schemaFilePath);

  if (parsed.schema.components[compName]?.properties[propKey]) {
    delete parsed.schema.components[compName].properties[propKey];
    if (Object.keys(parsed.schema.components[compName].properties).length === 0) {
      delete parsed.schema.components[compName].properties;
    }
  }

  const newContent = serializeStorageFileContent(schemaFilePath, [parsed], { body });
  const result = await safeWrite(schemaFilePath, newContent);

  if (!result.valid) {
    console.error('Validation failed:');
    for (const err of result.errors) {
      console.error(`  ✗ ${err.message}`);
    }
    process.exit(1);
  }

  if (!options.quiet) {
    console.log(`Removed property '${propKey}' from component '${compName}'`);
  }
}

/**
 * Remove a qualifier from relation
 */
async function undelQualifier(data, args, options) {
  if (args.length < 2) {
    throw new Error('undecl qual requires relation name and qualifier key');
  }

  const relName = args[0];
  const qualKey = args[1];

  if (!data.schema.relations[relName]) {
    throw new Error(`Relation '${relName}' not found`);
  }

  const rel = data.schema.relations[relName];
  if (!rel.qualifiers || !rel.qualifiers[qualKey]) {
    throw new Error(`Qualifier '${qualKey}' not found in relation '${relName}'`);
  }

  const schemaFilePath = await findSchemaFile(data);
  const { parsed, body } = await loadYamlFile(schemaFilePath);

  if (parsed.schema.relations[relName]?.qualifiers[qualKey]) {
    delete parsed.schema.relations[relName].qualifiers[qualKey];
    if (Object.keys(parsed.schema.relations[relName].qualifiers).length === 0) {
      delete parsed.schema.relations[relName].qualifiers;
    }
  }

  const newContent = serializeStorageFileContent(schemaFilePath, [parsed], { body });
  const result = await safeWrite(schemaFilePath, newContent);

  if (!result.valid) {
    console.error('Validation failed:');
    for (const err of result.errors) {
      console.error(`  ✗ ${err.message}`);
    }
    process.exit(1);
  }

  if (!options.quiet) {
    console.log(`Removed qualifier '${qualKey}' from relation '${relName}'`);
  }
}

