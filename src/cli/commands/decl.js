/**
 * Decl Command Handler - Declare T-box schema elements (classes, relations, properties, qualifiers)
 */

import { loadAll, getStoragePath } from '../../core/loader.js';
import { safeWrite } from '../../core/safe-write.js';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { parseStorageFileContent, serializeStorageFileContent } from '../../core/storage-file.js';

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
  comp <component> <key>:<type> [...]      Declare a new component with properties
  cmp <class> <local>:<Component> [...]    Attach components to a class
  rel <class> <type> <relation> <class>    Declare a new relation
  prop <component> <key>:<type> [...]      Add properties to an existing component
  qual <rel> <key>:<type> [...]            Declare a qualifier on a relation

Relationship Types:
  oto   1..1   one-to-one
  otm   1..*   one-to-many
  mto   *..1   many-to-one
  mtm   *..*   many-to-many

Options:
  --help      Show this help message
  --verbose   Show detailed output
  --quiet     Suppress output except errors
  required    Mark property/qualifier as required

Examples:
  # T-box declarations
  ontology decl cls :Person                      # Declare class Person
  ontology decl cls :Team
  ontology decl comp Identity name:string required  # Declare component with properties
  ontology decl comp Contact email:string required
  ontology decl prop Identity nickname:string       # Add property to component
  ontology decl rel :Person otm :MEMBER_OF :Team    # Declare relation
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
  const parsed = docs[0] || {};
  return { parsed, body };
}

/**
 * Serialize schema document in storage format
 * @param {string} filePath
 * @param {Object} data
 * @param {string} body
 * @returns {string}
 */
function serializeSchemaFile(filePath, data, body = '') {
  return serializeStorageFileContent(filePath, [data], { body });
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
  const { parsed, body } = await loadYamlFile(schemaFilePath);
  
  // Ensure schema.classes exists
  if (!parsed.schema) {
    parsed.schema = {};
  }
  if (!parsed.schema.classes) {
    parsed.schema.classes = {};
  }
  
  // Add the new class (empty definition)
  parsed.schema.classes[className] = {};
  
  // Write back with validation rollback
  const newContent = serializeSchemaFile(schemaFilePath, parsed, body);
  const result = await safeWrite(schemaFilePath, newContent);
  
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

  if (relation === 'LINKS_TO') {
    console.error(`Error: Relation '${relation}' is reserved for implicit wiki-link relationships.`);
    process.exit(1);
  }
  
  if (domain !== '*' && !isValidClassName(domain)) {
    console.error(`Error: Domain class '${domain}' must be ProperCase.`);
    process.exit(1);
  }
  
  if (range !== '*' && !isValidClassName(range)) {
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
  if (domain !== '*' && !data.schema.classes[domain]) {
    console.error(`Error: Domain class '${domain}' not defined in schema.`);
    console.error(`Hint: Run 'ontology decl cls :${domain}' first.`);
    process.exit(1);
  }
  
  if (range !== '*' && !data.schema.classes[range]) {
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
  const { parsed, body } = await loadYamlFile(schemaFilePath);
  
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
  
  // Write back with validation rollback
  const newContent = serializeSchemaFile(schemaFilePath, parsed, body);
  const result = await safeWrite(schemaFilePath, newContent);
  
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
 * Handle declaring a property on a component
 * @param {string[]} args
 * @param {Object} options
 */
async function handleDeclProperty(args, options) {
  if (args.length < 2) {
    console.error('Error: Property declaration requires component and property definition.');
    console.error('Usage: ontology decl prop <component> <key>:<type> [...] [required]');
    process.exit(1);
  }
  
  const compArg = args[0];
  const compName = parseClassName(compArg);
  const isRequired = args.includes('required');
  
  // Get all property definitions (excluding 'required' keyword)
  const propDefs = args.slice(1).filter(a => a !== 'required');
  
  if (propDefs.length === 0) {
    console.error('Error: At least one property definition required.');
    process.exit(1);
  }
  
  const data = await loadAll();
  
  // Check if component exists
  if (!data.schema.components || !data.schema.components[compName]) {
    console.error(`Error: Component '${compName}' not defined in schema.`);
    console.error(`Hint: Run 'ontology decl comp ${compName} <key>:<type>' first.`);
    process.exit(1);
  }
  
  const schemaFilePath = await findSchemaFile(data);
  const { parsed, body } = await loadYamlFile(schemaFilePath);
  
  // Ensure properties object exists
  if (!parsed.schema.components[compName].properties) {
    parsed.schema.components[compName].properties = {};
  }
  
  const properties = [];
  for (const propDef of propDefs) {
    try {
      const { key, type } = parsePropertyDef(propDef);
      
      // Add property
      const propObj = { type };
      if (isRequired) {
        propObj.required = true;
      }
      parsed.schema.components[compName].properties[key] = propObj;
      
      properties.push(key);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  }
  
  // Write back with validation rollback
  const newContent = serializeSchemaFile(schemaFilePath, parsed, body);
  const result = await safeWrite(schemaFilePath, newContent);
  
  if (!result.valid) {
    console.error('Validation failed after adding property:');
    for (const err of result.errors) {
      console.error(`  ✗ ${err.message}`);
    }
    process.exit(1);
  }
  
  if (!options.quiet) {
    const reqStr = isRequired ? ' (required)' : '';
    console.log(`Declared properties on component '${compName}': ${properties.join(', ')}${reqStr}`);
  }
}

/**
 * Handle declaring a component
 * @param {string[]} args
 * @param {Object} options
 */
async function handleDeclComponent(args, options) {
  if (args.length < 1) {
    console.error('Error: Component name required.');
    console.error('Usage: ontology decl comp <component> [key:type ...] [required]');
    process.exit(1);
  }
  
  const compArg = args[0];
  const compName = parseClassName(compArg);
  const isRequired = args.includes('required');
  
  if (!isValidClassName(compName)) {
    console.error(`Error: Component name '${compName}' must be ProperCase (e.g., Identity, Contact).`);
    process.exit(1);
  }
  
  // Get all property definitions (excluding 'required' keyword)
  const propDefs = args.slice(1).filter(a => a !== 'required');
  
  const data = await loadAll();
  const schemaFilePath = await findSchemaFile(data);
  
  // Check if component already exists
  if (data.schema.components && data.schema.components[compName]) {
    if (!options.quiet) {
      console.log(`Component '${compName}' already exists.`);
    }
    return;
  }
  
  // Load and update the schema file
  const { parsed, body } = await loadYamlFile(schemaFilePath);
  
  // Ensure schema.components exists
  if (!parsed.schema) {
    parsed.schema = {};
  }
  if (!parsed.schema.components) {
    parsed.schema.components = {};
  }
  
  // Create the component with properties
  const properties = {};
  for (const propDef of propDefs) {
    try {
      const { key, type } = parsePropertyDef(propDef);
      const propObj = { type };
      if (isRequired) {
        propObj.required = true;
      }
      properties[key] = propObj;
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  }
  
  parsed.schema.components[compName] = { properties };
  
  // Write back with validation rollback
  const newContent = serializeSchemaFile(schemaFilePath, parsed, body);
  const result = await safeWrite(schemaFilePath, newContent);
  
  if (!result.valid) {
    console.error('Validation failed after adding component:');
    for (const err of result.errors) {
      console.error(`  ✗ ${err.message}`);
    }
    process.exit(1);
  }
  
  if (!options.quiet) {
    const propNames = Object.keys(properties);
    if (propNames.length > 0) {
      const reqStr = isRequired ? ' (required)' : '';
      console.log(`Declared component '${compName}' with properties: ${propNames.join(', ')}${reqStr}`);
    } else {
      console.log(`Declared component '${compName}'.`);
    }
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
  const { parsed, body } = await loadYamlFile(schemaFilePath);
  
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
  
  // Write back with validation rollback
  const newContent = serializeSchemaFile(schemaFilePath, parsed, body);
  const result = await safeWrite(schemaFilePath, newContent);
  
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
 * Handle attaching components to a class
 * @param {string[]} args
 * @param {Object} options
 */
async function handleDeclClassComponent(args, options) {
  if (args.length < 2) {
    console.error('Error: Class and component mapping required.');
    console.error('Usage: ontology decl cmp <class> <localName>:<ComponentClass> [...]');
    process.exit(1);
  }

  const classArg = args[0];
  const className = parseClassName(classArg);

  const mappings = args.slice(1);

  const data = await loadAll();

  // Check if class exists
  if (!data.schema.classes[className]) {
    console.error(`Error: Class '${className}' not defined in schema.`);
    console.error(`Hint: Run 'ontology decl cls :${className}' first.`);
    process.exit(1);
  }

  // Parse and validate mappings
  const parsed_mappings = [];
  for (const mapping of mappings) {
    const [localName, compClass] = mapping.split(':');
    if (!localName || !compClass) {
      console.error(`Error: Invalid component mapping '${mapping}'. Use format: localName:ComponentClass`);
      process.exit(1);
    }
    if (!data.schema.components || !data.schema.components[compClass]) {
      console.error(`Error: Component '${compClass}' not defined in schema.`);
      console.error(`Hint: Run 'ontology decl comp ${compClass} <key>:<type>' first.`);
      process.exit(1);
    }
    parsed_mappings.push({ localName, compClass });
  }

  const schemaFilePath = await findSchemaFile(data);
  const { parsed, body } = await loadYamlFile(schemaFilePath);

  // Ensure class has components object
  if (!parsed.schema.classes[className] || typeof parsed.schema.classes[className] !== 'object') {
    parsed.schema.classes[className] = {};
  }
  if (!parsed.schema.classes[className].components) {
    parsed.schema.classes[className].components = {};
  }

  const attached = [];
  for (const { localName, compClass } of parsed_mappings) {
    parsed.schema.classes[className].components[localName] = compClass;
    attached.push(`${localName}: ${compClass}`);
  }

  // Write back with validation rollback
  const newContent = serializeSchemaFile(schemaFilePath, parsed, body);
  const result = await safeWrite(schemaFilePath, newContent);

  if (!result.valid) {
    console.error('Validation failed after attaching components:');
    for (const err of result.errors) {
      console.error(`  ✗ ${err.message}`);
    }
    process.exit(1);
  }

  if (!options.quiet) {
    console.log(`Attached components to '${className}': ${attached.join(', ')}`);
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
      
    case 'comp':
      await handleDeclComponent(subArgs, options);
      break;

    case 'cmp':
      await handleDeclClassComponent(subArgs, options);
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
