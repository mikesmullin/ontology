/**
 * Validator - Validate instances against schema
 */

/**
 * @typedef {import('./types.js').ClassInstance} ClassInstance
 * @typedef {import('./types.js').RelationInstance} RelationInstance
 * @typedef {import('./types.js').LoadedData} LoadedData
 */

/**
 * @typedef {Object} ValidationError
 * @property {'error' | 'warning'} severity
 * @property {string} message
 * @property {string} [source] - File path
 * @property {string} [instance] - Instance ID or description
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid
 * @property {ValidationError[]} errors
 * @property {ValidationError[]} warnings
 * @property {{ classes: number, relations: number }} counts
 */

/**
 * Check if a class name is ProperCase (PascalCase)
 * @param {string} name
 * @returns {boolean}
 */
function isProperCase(name) {
  return /^[A-Z][a-zA-Z0-9]*$/.test(name);
}

/**
 * Check if a relation name is UPPERCASE_UNDERSCORED
 * @param {string} name
 * @returns {boolean}
 */
function isUppercaseUnderscored(name) {
  return /^[A-Z][A-Z0-9_]*$/.test(name);
}

/**
 * Check if a name is camelCase
 * @param {string} name
 * @returns {boolean}
 */
function isCamelCase(name) {
  return /^[a-z][a-zA-Z0-9]*$/.test(name);
}

/**
 * Parse cardinality (supports both object and shorthand formats)
 * @param {any} cardinality - e.g., { min: 0, max: 'many' } or 'otm'
 * @returns {{ min: number, max: number | 'many' }}
 */
function parseCardinality(cardinality) {
  if (typeof cardinality === 'string') {
    switch (cardinality) {
      case 'oto': return { min: 1, max: 1 };
      case 'otm': return { min: 1, max: 'many' };
      case 'mto': return { min: 0, max: 1 };
      case 'mtm': return { min: 0, max: 'many' };
      default: return { min: 0, max: 'many' };
    }
  }
  return {
    min: cardinality?.min ?? 0,
    max: cardinality?.max ?? 'many'
  };
}

/**
 * Check if a value matches the expected type (supports array types like 'string[]')
 * @param {*} value
 * @param {string} type - Type name, e.g. 'string', 'bool', 'date', 'string[]'
 * @returns {{ valid: boolean, error?: string }}
 */
function validateType(value, type) {
  if (value === null || value === undefined) {
    return { valid: false, error: 'value is null or undefined' };
  }

  // Check for array type (e.g., 'string[]')
  if (type.endsWith('[]')) {
    const elementType = type.slice(0, -2);
    
    if (!Array.isArray(value)) {
      return { valid: false, error: `expected array, got ${typeof value}` };
    }
    
    for (let i = 0; i < value.length; i++) {
      const result = validateType(value[i], elementType);
      if (!result.valid) {
        return { valid: false, error: `element [${i}]: ${result.error}` };
      }
    }
    
    return { valid: true };
  }

  // Scalar types
  switch (type) {
    case 'string':
      if (typeof value !== 'string') {
        return { valid: false, error: `expected string, got ${typeof value}` };
      }
      return { valid: true };
    case 'bool':
      if (typeof value !== 'boolean') {
        return { valid: false, error: `expected bool, got ${typeof value}` };
      }
      return { valid: true };
    case 'date':
      if (typeof value === 'string') {
        const date = new Date(value);
        if (isNaN(date.getTime())) {
          return { valid: false, error: 'invalid date format' };
        }
        return { valid: true };
      }
      if (value instanceof Date) {
        return { valid: true };
      }
      return { valid: false, error: `expected date, got ${typeof value}` };
    default:
      return { valid: true };
  }
}

/**
 * Validate a class instance against schema
 * @param {ClassInstance} instance
 * @param {Record<string, any>} classSchema
 * @param {ValidationError[]} errors
 * @param {ValidationError[]} warnings
 */
function validateClassInstance(instance, classSchema, errors, warnings) {
  const source = instance._source || 'unknown';
  const instanceId = `${instance._class}:${instance._id}`;

  // Check required properties
  const properties = classSchema?.properties || {};
  
  for (const [propName, propDef] of Object.entries(properties)) {
    const value = instance[propName];

    // Check required
    if (propDef.required && (value === undefined || value === null)) {
      errors.push({
        severity: 'error',
        message: `Missing required property '${propName}'`,
        source,
        instance: instanceId
      });
      continue;
    }

    // Check type if value exists
    if (value !== undefined && value !== null && propDef.type) {
      const result = validateType(value, propDef.type);
      if (!result.valid) {
        errors.push({
          severity: 'error',
          message: `Property '${propName}' has invalid type: ${result.error}`,
          source,
          instance: instanceId
        });
      }
    }
  }
}

/**
 * Validate a relation instance against schema
 * @param {RelationInstance} relation
 * @param {Record<string, any>} relationSchema
 * @param {Map<string, ClassInstance>} instancesById
 * @param {Record<string, any>} classes
 * @param {ValidationError[]} errors
 * @param {ValidationError[]} warnings
 */
function validateRelationInstance(relation, relationSchema, instancesById, classes, errors, warnings) {
  const source = relation._source || 'unknown';
  const relationId = `${relation._from} -[${relation._relation}]-> ${relation._to}`;

  // Check _from exists
  const fromInstance = instancesById.get(relation._from);
  if (!fromInstance) {
    errors.push({
      severity: 'error',
      message: `Relation references non-existent source '${relation._from}'`,
      source,
      instance: relationId
    });
  }

  // Check _to exists
  const toInstance = instancesById.get(relation._to);
  if (!toInstance) {
    errors.push({
      severity: 'error',
      message: `Relation references non-existent target '${relation._to}'`,
      source,
      instance: relationId
    });
  }

  // Validate domain (source class matches)
  if (fromInstance && relationSchema.domain) {
    if (fromInstance._class !== relationSchema.domain) {
      errors.push({
        severity: 'error',
        message: `Domain mismatch: '${relation._from}' is ${fromInstance._class}, expected ${relationSchema.domain}`,
        source,
        instance: relationId
      });
    }
  }

  // Validate range (target class matches)
  if (toInstance && relationSchema.range) {
    if (toInstance._class !== relationSchema.range) {
      errors.push({
        severity: 'error',
        message: `Range mismatch: '${relation._to}' is ${toInstance._class}, expected ${relationSchema.range}`,
        source,
        instance: relationId
      });
    }
  }

  // Validate qualifiers
  if (relationSchema.qualifiers) {
    for (const [qualName, qualDef] of Object.entries(relationSchema.qualifiers)) {
      const value = relation[qualName];
      if (value !== undefined && value !== null && qualDef.type) {
        const result = validateType(value, qualDef.type);
        if (!result.valid) {
          errors.push({
            severity: 'error',
            message: `Qualifier '${qualName}' has invalid type: ${result.error}`,
            source,
            instance: relationId
          });
        }
      }
    }
  }
}

/**
 * Validate cardinality constraints (only max, not min)
 * We validate that:
 * - oto (1..1): at most 1 on each side
 * - otm (1..*): at most 1 on the 'from' side (but unlimited on 'to')
 * - mto (*..1): at most 1 on the 'to' side (but unlimited on 'from')
 * - mtm (*..*): no max constraint
 * Note: We don't enforce minimum - if no relation exists, that's okay
 * @param {RelationInstance[]} relations
 * @param {Record<string, any>} relationSchemas
 * @param {Map<string, ClassInstance>} instancesById
 * @param {ValidationError[]} errors
 * @param {ValidationError[]} warnings
 */
function validateCardinality(relations, relationSchemas, instancesById, errors, warnings) {
  // Group relations by (from, relationType) to check 'from' side max
  const fromCounts = new Map();
  // Group relations by (to, relationType) to check 'to' side max
  const toCounts = new Map();

  for (const rel of relations) {
    const fromKey = `${rel._from}:${rel._relation}`;
    const toKey = `${rel._to}:${rel._relation}`;
    
    if (!fromCounts.has(fromKey)) {
      fromCounts.set(fromKey, { count: 0, source: rel._source });
    }
    fromCounts.get(fromKey).count++;
    
    if (!toCounts.has(toKey)) {
      toCounts.set(toKey, { count: 0, source: rel._source });
    }
    toCounts.get(toKey).count++;
  }

  // Check max constraints based on cardinality type
  for (const [relName, relSchema] of Object.entries(relationSchemas)) {
    const card = parseCardinality(relSchema.cardinality);
    
    // For oto (1..1) and otm (1..*): check that 'from' side has at most 1
    // This means the first character of cardinality is 'o' (one)
    const cardStr = typeof relSchema.cardinality === 'string' ? relSchema.cardinality : null;
    const fromIsOne = cardStr ? cardStr.startsWith('o') : (card.max === 1 || card.min === 1);
    const toIsOne = cardStr ? cardStr.endsWith('o') : (card.max === 1);
    
    // Check 'from' side max constraint (oto, otm)
    if (fromIsOne && cardStr && (cardStr === 'oto' || cardStr === 'otm')) {
      // Actually for otm, the 'from' can have many relations to 'to'
      // oto means each 'from' maps to exactly one 'to'
      // Let me reconsider: oto = one-to-one, otm = one-to-many
      // In otm, one 'from' can relate to many 'to', but each 'to' has only one 'from'
      // So for 'from' side: oto limits to 1, otm does NOT limit
      // For 'to' side: oto limits to 1, mto limits to 1
    }
    
    // Simplified approach: only enforce max when explicitly set to a number (not 'many')
    if (card.max !== 'many' && typeof card.max === 'number') {
      for (const [key, data] of fromCounts) {
        if (key.endsWith(`:${relName}`) && data.count > card.max) {
          const instanceId = key.split(':')[0];
          errors.push({
            severity: 'error',
            message: `Cardinality violation: '${instanceId}' has ${data.count} '${relName}' relations, maximum is ${card.max}`,
            source: data.source,
            instance: instanceId
          });
        }
      }
    }
  }
}

/**
 * Validate schema naming conventions
 * @param {{ classes: Record<string, any>, relations: Record<string, any> }} schema
 * @param {ValidationError[]} errors
 * @param {ValidationError[]} warnings
 */
function validateSchemaNames(schema, errors, warnings) {
  // Check class names are ProperCase (PascalCase)
  for (const className of Object.keys(schema.classes || {})) {
    if (!isProperCase(className)) {
      warnings.push({
        severity: 'warning',
        message: `Class name '${className}' should be ProperCase (e.g., Person, TeamMember)`,
        source: 'schema',
        instance: `class:${className}`
      });
    }
    
    // Check property names are camelCase
    const classDef = schema.classes[className];
    if (classDef?.properties) {
      for (const propName of Object.keys(classDef.properties)) {
        if (!isCamelCase(propName)) {
          warnings.push({
            severity: 'warning',
            message: `Property name '${propName}' should be camelCase (e.g., givenName, emailAddress)`,
            source: 'schema',
            instance: `${className}.${propName}`
          });
        }
      }
    }
  }

  // Check relation names are UPPERCASE_UNDERSCORED
  for (const relName of Object.keys(schema.relations || {})) {
    if (!isUppercaseUnderscored(relName)) {
      warnings.push({
        severity: 'warning',
        message: `Relation name '${relName}' should be UPPERCASE_UNDERSCORED (e.g., MEMBER_OF, REPORTS_TO)`,
        source: 'schema',
        instance: `relation:${relName}`
      });
    }
    
    // Check cardinality uses shorthand format (oto, otm, mto, mtm)
    const relDef = schema.relations[relName];
    if (relDef?.cardinality && typeof relDef.cardinality !== 'string') {
      warnings.push({
        severity: 'warning',
        message: `Relation '${relName}' cardinality should use shorthand format (oto, otm, mto, mtm) instead of {min, max}`,
        source: 'schema',
        instance: `relation:${relName}`
      });
    }
    
    // Check qualifier names are camelCase
    if (relDef?.qualifiers) {
      for (const qualName of Object.keys(relDef.qualifiers)) {
        if (!isCamelCase(qualName)) {
          warnings.push({
            severity: 'warning',
            message: `Qualifier name '${qualName}' should be camelCase (e.g., since, createdAt)`,
            source: 'schema',
            instance: `${relName}.${qualName}`
          });
        }
      }
    }
  }
}

/**
 * Validate all instances against the schema
 * @param {LoadedData} data
 * @returns {ValidationResult}
 */
export function validate(data) {
  /** @type {ValidationError[]} */
  const errors = [];
  /** @type {ValidationError[]} */
  const warnings = [];

  const { schema, instances, rawDocuments } = data;

  // Validate document structure (apiVersion, kind, schema/spec)
  validateDocuments(rawDocuments || [], errors, warnings);

  // Validate that spec.relations is not used (only per-class relations allowed)
  validateNoTopLevelRelations(rawDocuments || [], errors, warnings);

  // Validate schema naming conventions
  validateSchemaNames(schema, errors, warnings);

  // Build instance lookup map and check for duplicate IDs
  const instancesById = new Map();
  const idsByNamespace = new Map();

  for (const instance of instances.classes) {
    if (instance._id) {
      const namespace = instance._namespace || 'default';
      const key = `${namespace}:${instance._id}`;

      // Check for duplicate _id within namespace
      if (idsByNamespace.has(key)) {
        errors.push({
          severity: 'error',
          message: `Duplicate _id '${instance._id}' in namespace '${namespace}' (also in ${idsByNamespace.get(key)})`,
          source: instance._source,
          instance: `${instance._class}:${instance._id}`
        });
      } else {
        idsByNamespace.set(key, instance._source);
      }

      instancesById.set(instance._id, instance);
    }
  }

  // Validate class instances
  for (const instance of instances.classes) {
    const className = instance._class;
    
    // Check class exists in schema
    if (!schema.classes[className]) {
      errors.push({
        severity: 'error',
        message: `Class '${className}' not defined in schema`,
        source: instance._source,
        instance: `${className}:${instance._id}`
      });
      continue;
    }

    validateClassInstance(instance, schema.classes[className], errors, warnings);
  }

  // Validate relation instances
  for (const relation of instances.relations) {
    const relationType = relation._relation;

    // Check relation exists in schema
    if (!schema.relations[relationType]) {
      errors.push({
        severity: 'error',
        message: `Relation '${relationType}' not defined in schema`,
        source: relation._source,
        instance: `${relation._from} -[${relationType}]-> ${relation._to}`
      });
      continue;
    }

    validateRelationInstance(
      relation,
      schema.relations[relationType],
      instancesById,
      schema.classes,
      errors,
      warnings
    );
  }

  // Validate relation placement (must be in same file as _from instance)
  validateRelationPlacement(instances.relations, instancesById, errors, warnings);

  // Validate cardinality constraints
  validateCardinality(
    instances.relations,
    schema.relations,
    instancesById,
    errors,
    warnings
  );

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    counts: {
      classes: instances.classes.length,
      relations: instances.relations.length
    }
  };
}

/**
 * Validate that relations are defined in the same file as their _from instance
 * @param {RelationInstance[]} relations
 * @param {Map<string, ClassInstance>} instancesById
 * @param {ValidationError[]} errors
 * @param {ValidationError[]} warnings
 */
function validateRelationPlacement(relations, instancesById, errors, warnings) {
  for (const relation of relations) {
    const fromInstance = instancesById.get(relation._from);
    if (!fromInstance) continue; // Already reported as missing

    const relationSource = relation._source;
    const instanceSource = fromInstance._source;

    if (relationSource !== instanceSource) {
      errors.push({
        severity: 'error',
        message: `Relation must be defined in same file as '${relation._from}' (expected ${instanceSource})`,
        source: relationSource,
        instance: `${relation._from} -[${relation._relation}]-> ${relation._to}`
      });
    }
  }
}

/**
 * Validate that spec.relations is not used (only per-class relations are allowed)
 * @param {{ source: string, document: any }[]} rawDocuments
 * @param {ValidationError[]} errors
 * @param {ValidationError[]} warnings
 */
function validateNoTopLevelRelations(rawDocuments, errors, warnings) {
  for (const { source, document } of rawDocuments) {
    if (document?.spec?.relations) {
      errors.push({
        severity: 'error',
        message: `Top-level 'spec.relations' is deprecated. Define relations within each class instance using 'relations:' property`,
        source,
        instance: 'spec.relations'
      });
    }
  }
}

/**
 * Validate document structure
 * @param {{ source: string, document: any }[]} rawDocuments
 * @param {ValidationError[]} errors
 * @param {ValidationError[]} warnings
 */
function validateDocuments(rawDocuments, errors, warnings) {
  // Group documents by source file
  const docsByFile = new Map();

  for (const { source, document } of rawDocuments) {
    if (!docsByFile.has(source)) {
      docsByFile.set(source, []);
    }
    docsByFile.get(source).push(document);
  }

  for (const [source, docs] of docsByFile) {
    let hasSchemaOrSpec = false;

    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      const docLabel = docs.length > 1 ? `document ${i + 1}` : 'document';

      // Check apiVersion
      if (doc.apiVersion !== 'agent/v1') {
        errors.push({
          severity: 'error',
          message: doc.apiVersion 
            ? `Invalid apiVersion '${doc.apiVersion}', expected 'agent/v1'`
            : `Missing required field 'apiVersion: agent/v1'`,
          source,
          instance: docLabel
        });
      }

      // Check kind
      if (doc.kind !== 'Ontology') {
        errors.push({
          severity: 'error',
          message: doc.kind
            ? `Invalid kind '${doc.kind}', expected 'Ontology'`
            : `Missing required field 'kind: Ontology'`,
          source,
          instance: docLabel
        });
      }

      // Track if schema or spec exists
      if (doc.schema || doc.spec) {
        hasSchemaOrSpec = true;
      }
    }

    // Check that file has at least one schema or spec
    if (!hasSchemaOrSpec) {
      errors.push({
        severity: 'error',
        message: `File must contain at least one 'schema:' or 'spec:' section`,
        source,
        instance: 'file'
      });
    }
  }
}
