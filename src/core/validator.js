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
 * Validate cardinality constraints
 * @param {RelationInstance[]} relations
 * @param {Record<string, any>} relationSchemas
 * @param {Map<string, ClassInstance>} instancesById
 * @param {ValidationError[]} errors
 * @param {ValidationError[]} warnings
 */
function validateCardinality(relations, relationSchemas, instancesById, errors, warnings) {
  // Group relations by (from, relationType)
  const relationCounts = new Map();

  for (const rel of relations) {
    const key = `${rel._from}:${rel._relation}`;
    if (!relationCounts.has(key)) {
      relationCounts.set(key, { count: 0, source: rel._source });
    }
    relationCounts.get(key).count++;
  }

  // Check each instance against cardinality constraints
  for (const [instanceId, instance] of instancesById) {
    const className = instance._class;

    for (const [relName, relSchema] of Object.entries(relationSchemas)) {
      // Only check if this instance is in the domain
      if (relSchema.domain !== className) continue;

      const key = `${instanceId}:${relName}`;
      const count = relationCounts.get(key)?.count || 0;
      const min = relSchema.cardinality?.min ?? 0;
      const max = relSchema.cardinality?.max;

      if (count < min) {
        errors.push({
          severity: 'error',
          message: `Cardinality violation: '${instanceId}' has ${count} '${relName}' relations, minimum is ${min}`,
          source: instance._source,
          instance: instanceId
        });
      }

      if (max !== 'many' && max !== undefined && count > max) {
        errors.push({
          severity: 'error',
          message: `Cardinality violation: '${instanceId}' has ${count} '${relName}' relations, maximum is ${max}`,
          source: instance._source,
          instance: instanceId
        });
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
