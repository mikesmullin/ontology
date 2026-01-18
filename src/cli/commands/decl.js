/**
 * Decl Command Handler - Declare T-box schema elements (classes, relations, properties, qualifiers)
 */

import { loadAll, getStoragePath } from '../../core/loader.js';
import { validate } from '../../core/validator.js';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import yaml from 'js-yaml';

/**
 * Show decl command help
 */
function showHelp() {
  console.log(`
ontology decl - Declare schema elements (T-box)

Usage:
  ontology decl <subcommand> [options]

Subcommands:
  cls <class>                              Declare a new class
  rel <class> <type> <relation> <class>    Declare a new relation
  prop <class> <key>:<type> [...] [required]  Declare a property on a class
  qual <rel> <key>:<type> [...] [required]    Declare a qualifier on a relation

Relationship Types:
  oto   1..1   one-to-one
  otm   1..*   one-to-many
  mto   *..1   many-to-one
  mtm   *..*   many-to-many

Options:
  --help      Show this help message
  --verbose   Show detailed output
  --quiet     Suppress output except errors

Examples:
  # T-box declarations
  ontology decl cls :Person                      # Declare class Person
  ontology decl cls :Team
  ontology decl cls :Product
  ontology decl rel :Person otm :MEMBER_OF :Team # Declare relation
  ontology decl rel :Team otm :OWNS :Product
  ontology decl prop :Person name:string required   # Declare required property
  ontology decl prop :Person email:string
  ontology decl qual :OWNS since:date required      # Declare qualifier
`);
}

/**
 * Validate cardinality type string
 * @param {string} type - 'oto', 'otm', 'mto', 'mtm'
 * @returns {string}
 */
function validateCardinality(type) {
  const valid = ['oto', 'otm', 'mto', 'mtm'];
  if (!valid.includes(type)) {
    throw new Error(`Invalid cardinality type '${type}'. Use: oto, otm, mto, mtm`);
  }
  return type;
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
 * Validate class name is ProperCase
 * @param {string} name
 * @returns {boolean}
 */
function isValidClassName(name) {
  return /^[A-Z][a-zA-Z0-9]*$/.test(name);
}

/**
 * Validate relation name is UPPERCASE_UNDERSCORED or camelCase (for compatibility)
 * @param {string} name
 * @returns {boolean}
 */
function isValidRelationName(name) {
  // Allow both formats for now: UPPER_CASE or camelCase
  return /^[A-Z][A-Z0-9_]*$/.test(name) || /^[a-z][a-zA-Z0-9]*$/.test(name);
}

/**
 * Parse property/qualifier definition (key:type)
 * @param {string} def
 * @returns {{ key: string, type: string }}
 */
function parsePropertyDef(def) {
  const [key, type] = def.split(':');
  if (!key || !type) {
    throw new Error(`Invalid property definition '${def}'. Use format: key:type`);
  }
  
  const validTypes = ['string', 'bool', 'date', 'string[]', 'bool[]', 'date[]'];
  if (!validTypes.includes(type)) {
    throw new Error(`Invalid type '${type}'. Valid types: ${validTypes.join(', ')}`);
  }
  
  return { key, type };
}

/**
 * Find or create the schema file
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
  return join(storagePath, 'org-stormy.yml');
}

/**
 * Load and parse a YAML file
 * @param {string} filePath
 * @returns {Promise<Object>}
 */
async function loadYamlFile(filePath) {
  const content = await readFile(filePath, 'utf-8');
  const parsed = yaml.load(content);
  return { content, parsed };
}

/**
 * Write YAML file with proper formatting
 * @param {string} filePath
 * @param {Object} data
 * @returns {Promise<void>}
 */
async function writeYamlFile(filePath, data) {
  const content = yaml.dump(data, { lineWidth: -1, noRefs: true, quotingType: '"' });
  await writeFile(filePath, content, 'utf-8');
}

/**
 * Handle declaring a class
 * @param {string[]} args
 * @param {Object} options
 */
async function handleDeclClass(args, options) {
  const name = args[0];
  if (!name) {
    console.error('Error: Class name required.');
    console.error('Usage: ontology decl cls <class>');
    process.exit(1);
  }
  
  const className = parseClassName(name);
  
  if (!isValidClassName(className)) {
    console.error(`Error: Class name '${className}' must be ProperCase (e.g., Person, Team).`);
    process.exit(1);
  }
  
  const data = await loadAll();
  const schemaFilePath = await findSchemaFile(data);
  
  // Check if class already exists
  if (data.schema.classes[className]) {
    if (!options.quiet) {
      console.log(`Class '${className}' already exists.`);
    }
    return;
  }
  
  // Load and update the schema file
  const { content, parsed } = await loadYamlFile(schemaFilePath);
  
  // Ensure schema.classes exists
  if (!parsed.schema) {
    parsed.schema = {};
  }
  if (!parsed.schema.classes) {
    parsed.schema.classes = {};
  }
  
  // Add the new class (empty definition)
  parsed.schema.classes[className] = {};
  
  // Write back
  const newContent = yaml.dump(parsed, { lineWidth: -1, noRefs: true });
  await writeFile(schemaFilePath, newContent, 'utf-8');
  
  // Validate
  const newData = await loadAll();
  const result = validate(newData);
  
  if (!result.valid) {
    console.error('Validation failed after adding class:');
    for (const err of result.errors) {
      console.error(`  ✗ ${err.message}`);
    }
    process.exit(1);
  }
  
  if (!options.quiet) {
    console.log(`Declared class '${className}'.`);
  }
}

/**
 * Handle declaring a relation
 * @param {string[]} args
 * @param {Object} options
 */
async function handleDeclRelation(args, options) {
  if (args.length < 4) {
    console.error('Error: Relation declaration requires 4 arguments.');
    console.error('Usage: ontology decl rel <domain> <cardinality> <relation> <range>');
    process.exit(1);
  }
  
  const [domainArg, cardinalityType, relationArg, rangeArg] = args;
  
  const domain = parseClassName(domainArg);
  const relation = parseClassName(relationArg);
  const range = parseClassName(rangeArg);
  
  if (!isValidClassName(domain)) {
    console.error(`Error: Domain class '${domain}' must be ProperCase.`);
    process.exit(1);
  }
  
  if (!isValidClassName(range)) {
    console.error(`Error: Range class '${range}' must be ProperCase.`);
    process.exit(1);
  }
  
  if (!isValidRelationName(relation)) {
    console.error(`Error: Relation name '${relation}' must be UPPERCASE_UNDERSCORED or camelCase.`);
    process.exit(1);
  }
  
  let cardinality;
  try {
    cardinality = validateCardinality(cardinalityType);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
  
  const data = await loadAll();
  const schemaFilePath = await findSchemaFile(data);
  
  // Check if domain and range classes exist
  if (!data.schema.classes[domain]) {
    console.error(`Error: Domain class '${domain}' not defined in schema.`);
    console.error(`Hint: Run 'ontology decl cls :${domain}' first.`);
    process.exit(1);
  }
  
  if (!data.schema.classes[range]) {
    console.error(`Error: Range class '${range}' not defined in schema.`);
    console.error(`Hint: Run 'ontology decl cls :${range}' first.`);
    process.exit(1);
  }
  
  // Check if relation already exists
  if (data.schema.relations[relation]) {
    if (!options.quiet) {
      console.log(`Relation '${relation}' already exists.`);
    }
    return;
  }
  
  // Load and update the schema file
  const { content, parsed } = await loadYamlFile(schemaFilePath);
  
  // Ensure schema.relations exists
  if (!parsed.schema) {
    parsed.schema = {};
  }
  if (!parsed.schema.relations) {
    parsed.schema.relations = {};
  }
  
  // Add the new relation
  parsed.schema.relations[relation] = {
    domain,
    range,
    cardinality
  };
  
  // Write back
  const newContent = yaml.dump(parsed, { lineWidth: -1, noRefs: true });
  await writeFile(schemaFilePath, newContent, 'utf-8');
  
  // Validate
  const newData = await loadAll();
  const result = validate(newData);
  
  if (!result.valid) {
    console.error('Validation failed after adding relation:');
    for (const err of result.errors) {
      console.error(`  ✗ ${err.message}`);
    }
    process.exit(1);
  }
  
  if (!options.quiet) {
    console.log(`Declared relation '${relation}': ${domain} ${cardinality} ${range}`);
  }
}

/**
 * Handle declaring a property
 * @param {string[]} args
 * @param {Object} options
 */
async function handleDeclProperty(args, options) {
  if (args.length < 2) {
    console.error('Error: Property declaration requires class and property definition.');
    console.error('Usage: ontology decl prop <class> <key>:<type> [...] [required]');
    process.exit(1);
  }
  
  const classArg = args[0];
  const className = parseClassName(classArg);
  const isRequired = args.includes('required');
  
  // Get all property definitions (excluding 'required' keyword)
  const propDefs = args.slice(1).filter(a => a !== 'required');
  
  if (propDefs.length === 0) {
    console.error('Error: At least one property definition required.');
    process.exit(1);
  }
  
  const data = await loadAll();
  
  // Check if class exists
  if (!data.schema.classes[className]) {
    console.error(`Error: Class '${className}' not defined in schema.`);
    console.error(`Hint: Run 'ontology decl cls :${className}' first.`);
    process.exit(1);
  }
  
  const schemaFilePath = await findSchemaFile(data);
  const { content, parsed } = await loadYamlFile(schemaFilePath);
  
  // Ensure properties object exists
  if (!parsed.schema.classes[className].properties) {
    parsed.schema.classes[className].properties = {};
  }
  
  const properties = [];
  for (const propDef of propDefs) {
    try {
      const { key, type } = parsePropertyDef(propDef);
      
      // Add property
      parsed.schema.classes[className].properties[key] = {
        type,
        required: isRequired
      };
      
      properties.push(key);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  }
  
  // Write back
  const newContent = yaml.dump(parsed, { lineWidth: -1, noRefs: true });
  await writeFile(schemaFilePath, newContent, 'utf-8');
  
  // Validate
  const newData = await loadAll();
  const result = validate(newData);
  
  if (!result.valid) {
    console.error('Validation failed after adding property:');
    for (const err of result.errors) {
      console.error(`  ✗ ${err.message}`);
    }
    process.exit(1);
  }
  
  if (!options.quiet) {
    const reqStr = isRequired ? ' (required)' : '';
    console.log(`Declared properties on '${className}': ${properties.join(', ')}${reqStr}`);
  }
}

/**
 * Handle declaring a qualifier
 * @param {string[]} args
 * @param {Object} options
 */
async function handleDeclQualifier(args, options) {
  if (args.length < 2) {
    console.error('Error: Qualifier declaration requires relation and qualifier definition.');
    console.error('Usage: ontology decl qual <relation> <key>:<type> [...] [required]');
    process.exit(1);
  }
  
  const relArg = args[0];
  const relName = parseClassName(relArg);
  const isRequired = args.includes('required');
  
  // Get all qualifier definitions (excluding 'required' keyword)
  const qualDefs = args.slice(1).filter(a => a !== 'required');
  
  if (qualDefs.length === 0) {
    console.error('Error: At least one qualifier definition required.');
    process.exit(1);
  }
  
  const data = await loadAll();
  
  // Check if relation exists
  if (!data.schema.relations[relName]) {
    console.error(`Error: Relation '${relName}' not defined in schema.`);
    process.exit(1);
  }
  
  const schemaFilePath = await findSchemaFile(data);
  const { content, parsed } = await loadYamlFile(schemaFilePath);
  
  // Ensure qualifiers object exists
  if (!parsed.schema.relations[relName].qualifiers) {
    parsed.schema.relations[relName].qualifiers = {};
  }
  
  const qualifiers = [];
  for (const qualDef of qualDefs) {
    try {
      const { key, type } = parsePropertyDef(qualDef);
      
      // Add qualifier
      const qualObj = { type };
      if (isRequired) {
        qualObj.required = true;
      }
      parsed.schema.relations[relName].qualifiers[key] = qualObj;
      
      qualifiers.push(key);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  }
  
  // Write back
  const newContent = yaml.dump(parsed, { lineWidth: -1, noRefs: true });
  await writeFile(schemaFilePath, newContent, 'utf-8');
  
  // Validate
  const newData = await loadAll();
  const result = validate(newData);
  
  if (!result.valid) {
    console.error('Validation failed after adding qualifier:');
    for (const err of result.errors) {
      console.error(`  ✗ ${err.message}`);
    }
    process.exit(1);
  }
  
  if (!options.quiet) {
    const reqStr = isRequired ? ' (required)' : '';
    console.log(`Declared qualifiers on '${relName}': ${qualifiers.join(', ')}${reqStr}`);
  }
}

/**
 * Handle the decl command
 * @param {string[]} args
 */
export async function handleDecl(args) {
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
  const [subcommand, ...subArgs] = cleanArgs;
  
  switch (subcommand) {
    case 'cls':
      await handleDeclClass(subArgs, options);
      break;
      
    case 'rel':
      await handleDeclRelation(subArgs, options);
      break;
      
    case 'prop':
      await handleDeclProperty(subArgs, options);
      break;
      
    case 'qual':
      await handleDeclQualifier(subArgs, options);
      break;
      
    default:
      console.error(`Error: Unknown decl subcommand '${subcommand}'`);
      console.error("Run 'ontology decl --help' for usage information.");
      process.exit(1);
  }
}
