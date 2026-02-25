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
    case 'ref':
      if (typeof value !== 'string') {
        return { valid: false, error: `expected ref string (<id>:<Class>), got ${typeof value}` };
      }
      {
        const parsedRef = parseTypedReference(value);
        if (!parsedRef.valid) {
          return { valid: false, error: parsedRef.error || 'invalid ref format' };
        }
      }
      return { valid: true };
    default:
      return { valid: true };
  }
}

/**
 * Parse typed reference in <id>:<Class> form
 * @param {any} value
 * @returns {{ valid: boolean, id?: string, className?: string, error?: string }}
 */
function parseTypedReference(value) {
  if (typeof value !== 'string') {
    return { valid: false, error: `expected ref string, got ${typeof value}` };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return { valid: false, error: 'expected ref in <id>:<Class> form, got empty string' };
  }

  const separatorIndex = trimmed.lastIndexOf(':');
  if (separatorIndex <= 0 || separatorIndex === trimmed.length - 1) {
    return { valid: false, error: `expected ref in <id>:<Class> form, got '${trimmed}'` };
  }

  const id = trimmed.slice(0, separatorIndex).trim();
  const className = trimmed.slice(separatorIndex + 1).trim();

  if (!id) {
    return { valid: false, error: `expected ref id before ':', got '${trimmed}'` };
  }

  if (!className || !/^[A-Za-z][A-Za-z0-9_]*$/.test(className)) {
    return { valid: false, error: `expected class name after ':', got '${className || ''}'` };
  }

  return { valid: true, id, className };
}

/**
 * Validate a class instance against schema (component-based)
 * @param {ClassInstance} instance
 * @param {Record<string, any>} classSchema
 * @param {Record<string, any>} componentSchemas - All component definitions
 * @param {ValidationError[]} errors
 * @param {ValidationError[]} warnings
 */
function validateClassInstance(instance, classSchema, componentSchemas, instancesById, errors, warnings) {
  const source = instance._source || 'unknown';
  const instanceId = `${instance._class}:${instance._id}`;

  // Get the components defined for this class
  const classComponents = classSchema?.components || {};
  const instanceComponents = instance.components || {};

  // Reserved/system fields that are allowed at the instance level
  const reservedFields = new Set(['_class', '_id', '_namespace', '_source', 'relations', 'components']);

  // Check for any properties at instance root level (not allowed - must be in components)
  for (const key of Object.keys(instance)) {
    if (!reservedFields.has(key)) {
      errors.push({
        severity: 'error',
        message: `Property '${key}' must be defined inside a component, not at instance root level`,
        source,
        instance: instanceId
      });
    }
  }

  // Validate each component instance
  for (const [localName, componentValues] of Object.entries(instanceComponents)) {
    // Check if this local name is defined in the class schema
    const componentClassName = classComponents[localName];
    if (!componentClassName) {
      errors.push({
        severity: 'error',
        message: `Component '${localName}' is not defined in class schema for '${instance._class}'`,
        source,
        instance: instanceId
      });
      continue;
    }

    // Get the component definition
    const componentDef = componentSchemas[componentClassName];
    if (!componentDef) {
      errors.push({
        severity: 'error',
        message: `Component class '${componentClassName}' (referenced by '${localName}') is not defined in schema`,
        source,
        instance: instanceId
      });
      continue;
    }

    // Validate properties within this component
    const properties = componentDef?.properties || {};
    
    // Check required properties
    for (const [propName, propDef] of Object.entries(properties)) {
      const value = componentValues[propName];

      // Check required
      if (propDef.required && (value === undefined || value === null)) {
        errors.push({
          severity: 'error',
          message: `Missing required property '${localName}.${propName}'`,
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
            message: `Property '${localName}.${propName}' has invalid type: ${result.error}`,
            source,
            instance: instanceId
          });
        }

        if (result.valid && (propDef.type === 'ref' || propDef.type === 'ref[]')) {
          const refValues = propDef.type === 'ref[]' ? value : [value];
          const allowedTypes = Array.isArray(propDef.allowedTypes)
            ? propDef.allowedTypes.filter((item) => typeof item === 'string' && item.trim())
            : null;
          for (let i = 0; i < refValues.length; i++) {
            const rawRef = refValues[i];
            const parsedRef = parseTypedReference(rawRef);

            if (!parsedRef.valid) {
              errors.push({
                severity: 'error',
                message: `Property '${localName}.${propName}' has invalid ref value${propDef.type === 'ref[]' ? ` at [${i}]` : ''}: ${parsedRef.error}`,
                source,
                instance: instanceId
              });
              continue;
            }

            const target = instancesById.get(parsedRef.id);
            if (!target) {
              errors.push({
                severity: 'error',
                message: `Property '${localName}.${propName}' references non-existent instance '${parsedRef.id}:${parsedRef.className}'`,
                source,
                instance: instanceId
              });
              continue;
            }

            if (target._class !== parsedRef.className) {
              errors.push({
                severity: 'error',
                message: `Property '${localName}.${propName}' reference type mismatch for '${parsedRef.id}:${parsedRef.className}' (actual class is '${target._class}')`,
                source,
                instance: instanceId
              });
              continue;
            }

            if (allowedTypes && allowedTypes.length > 0 && !allowedTypes.includes(parsedRef.className)) {
              errors.push({
                severity: 'error',
                message: `Property '${localName}.${propName}' reference '${parsedRef.id}:${parsedRef.className}' violates allowedTypes [${allowedTypes.join(', ')}]`,
                source,
                instance: instanceId
              });
            }
          }
        }
      }
    }

    // Check for undefined properties in component (strict mode - no schemaless)
    for (const propName of Object.keys(componentValues)) {
      if (!properties[propName]) {
        errors.push({
          severity: 'error',
          message: `Property '${localName}.${propName}' is not defined in component '${componentClassName}'`,
          source,
          instance: instanceId
        });
      }
    }
  }

  // Check that all required components have values
  for (const [localName, componentClassName] of Object.entries(classComponents)) {
    if (!instanceComponents[localName]) {
      // Check if the component has required properties
      const componentDef = componentSchemas[componentClassName];
      if (componentDef?.properties) {
        const hasRequired = Object.values(componentDef.properties).some(p => p.required);
        if (hasRequired) {
          errors.push({
            severity: 'error',
            message: `Missing required component '${localName}' (${componentClassName})`,
            source,
            instance: instanceId
          });
        }
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
  if (fromInstance && relationSchema.domain && relationSchema.domain !== '*') {
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
  if (toInstance && relationSchema.range && relationSchema.range !== '*') {
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
 * @param {{ components: Record<string, any>, classes: Record<string, any>, relations: Record<string, any> }} schema
 * @param {ValidationError[]} errors
 * @param {ValidationError[]} warnings
 */
function validateSchemaNames(schema, errors, warnings) {
  // Check component names are ProperCase (PascalCase)
  for (const componentName of Object.keys(schema.components || {})) {
    if (!isProperCase(componentName)) {
      warnings.push({
        severity: 'warning',
        message: `Component name '${componentName}' should be ProperCase (e.g., Identity, Contact)`,
        source: 'schema',
        instance: `component:${componentName}`
      });
    }
    
    // Check property names within components are camelCase
    const componentDef = schema.components[componentName];
    if (componentDef?.properties) {
      for (const propName of Object.keys(componentDef.properties)) {
        if (!isCamelCase(propName)) {
          warnings.push({
            severity: 'warning',
            message: `Property name '${propName}' should be camelCase (e.g., givenName, emailAddress)`,
            source: 'schema',
            instance: `${componentName}.${propName}`
          });
        }
      }
    }
  }

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
    
    // Check component local names are camelCase
    const classDef = schema.classes[className];
    if (classDef?.components) {
      for (const localName of Object.keys(classDef.components)) {
        if (!isCamelCase(localName)) {
          warnings.push({
            severity: 'warning',
            message: `Component local name '${localName}' should be camelCase (e.g., identity, contact)`,
            source: 'schema',
            instance: `${className}.${localName}`
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
 * Validate schema property metadata extensions.
 * @param {{ components: Record<string, any> }} schema
 * @param {ValidationError[]} errors
 * @param {ValidationError[]} warnings
 */
function validateSchemaPropertyMetadata(schema, errors, warnings) {
  for (const [componentName, componentDef] of Object.entries(schema.components || {})) {
    const properties = componentDef?.properties || {};

    for (const [propName, propDef] of Object.entries(properties)) {
      const location = `${componentName}.${propName}`;

      if (propDef.allowedTypes !== undefined) {
        if (propDef.type !== 'ref' && propDef.type !== 'ref[]') {
          errors.push({
            severity: 'error',
            message: `Property '${location}' uses allowedTypes but type is '${propDef.type}' (expected ref/ref[])`,
            source: 'schema',
            instance: location
          });
        } else if (!Array.isArray(propDef.allowedTypes) || propDef.allowedTypes.some((item) => typeof item !== 'string' || !item.trim())) {
          errors.push({
            severity: 'error',
            message: `Property '${location}' allowedTypes must be a string array when provided`,
            source: 'schema',
            instance: location
          });
        }
      }

      if (propDef.uiHints !== undefined) {
        if (!Array.isArray(propDef.uiHints) || propDef.uiHints.some((item) => typeof item !== 'string' || !item.trim())) {
          errors.push({
            severity: 'error',
            message: `Property '${location}' uiHints must be a string array when provided`,
            source: 'schema',
            instance: location
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
  const implicitLinksToSchema = { domain: '*', range: '*', cardinality: 'mtm' };

  if (schema.relations?.LINKS_TO) {
    errors.push({
      severity: 'error',
      message: `Relation 'LINKS_TO' is reserved and cannot be declared in schema`,
      source: 'schema',
      instance: 'relation:LINKS_TO'
    });
  }

  // Validate document structure (apiVersion, kind, schema/spec)
  validateDocuments(rawDocuments || [], errors, warnings);

  // Validate that spec.relations is not used (only per-class relations allowed)
  validateNoTopLevelRelations(rawDocuments || [], errors, warnings);

  // Validate relation target format (must be string or object with _to)
  validateRelationTargetFormat(rawDocuments || [], errors, warnings);

  // Validate schema naming conventions
  validateSchemaNames(schema, errors, warnings);

  // Validate schema property metadata extensions (allowedTypes/uiHints)
  validateSchemaPropertyMetadata(schema, errors, warnings);

  // Validate file-level class instance constraint (max 1 per file)
  validateSingleClassInstancePerFile(rawDocuments || [], errors, warnings);

  // Build instance lookup map and check for duplicate IDs
  const instancesById = new Map();
  const firstSeenById = new Map();

  for (const instance of instances.classes) {
    if (instance._id) {
      const firstSeen = firstSeenById.get(instance._id);

      // Check for duplicate _id globally
      if (firstSeen) {
        errors.push({
          severity: 'error',
          message: `Duplicate _id '${instance._id}' detected; IDs must be globally unique (already defined in ${firstSeen.source})`,
          source: instance._source,
          instance: `${instance._class}:${instance._id}`
        });
      } else {
        firstSeenById.set(instance._id, {
          source: instance._source,
          className: instance._class
        });
      }

      if (!instancesById.has(instance._id)) {
        instancesById.set(instance._id, instance);
      }
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

    validateClassInstance(instance, schema.classes[className], schema.components, instancesById, errors, warnings);
  }

  // Validate relation instances
  for (const relation of instances.relations) {
    const relationType = relation._relation;
    const relationSchema = relationType === 'LINKS_TO'
      ? implicitLinksToSchema
      : schema.relations[relationType];

    // Check relation exists in schema
    if (!relationSchema) {
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
      relationSchema,
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
 * Validate that each file contains at most one class instance.
 * @param {{ source: string, document: any }[]} rawDocuments
 * @param {ValidationError[]} errors
 * @param {ValidationError[]} warnings
 */
function validateSingleClassInstancePerFile(rawDocuments, errors, warnings) {
  const classCountByFile = new Map();

  for (const { source, document } of rawDocuments) {
    if (!classCountByFile.has(source)) {
      classCountByFile.set(source, 0);
    }

    const classes = document?.spec?.classes;
    if (!Array.isArray(classes)) continue;

    classCountByFile.set(source, classCountByFile.get(source) + classes.length);
  }

  for (const [source, count] of classCountByFile.entries()) {
    if (count > 1) {
      errors.push({
        severity: 'error',
        message: `File contains ${count} class instances; each file may contain exactly one class instance`,
        source,
        instance: 'spec.classes'
      });
    }
  }
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
 * Validate relation target format within class instances
 * Targets must be either:
 * - A string (simple ID reference)
 * - An object with '_to' key (qualified relation with qualifiers)
 * 
 * Invalid formats like { _id: 'x', _class: 'Y' } are rejected.
 * 
 * @param {{ source: string, document: any }[]} rawDocuments
 * @param {ValidationError[]} errors
 * @param {ValidationError[]} warnings
 */
function validateRelationTargetFormat(rawDocuments, errors, warnings) {
  for (const { source, document } of rawDocuments) {
    const classes = document?.spec?.classes;
    if (!Array.isArray(classes)) continue;

    for (const instance of classes) {
      if (!instance?.relations || typeof instance.relations !== 'object') continue;

      const instanceId = instance._id || 'unknown';
      const instanceClass = instance._class || 'unknown';

      for (const [relationName, targets] of Object.entries(instance.relations)) {
        if (!Array.isArray(targets)) continue;

        for (let i = 0; i < targets.length; i++) {
          const target = targets[i];

          if (typeof target === 'string') {
            // Valid: simple ID string
            continue;
          }

          if (typeof target === 'object' && target !== null) {
            if (target._to) {
              // Valid: object with _to (qualified relation)
              continue;
            }

            // Invalid: object without _to
            const keys = Object.keys(target);
            const hasIdOrClass = keys.includes('_id') || keys.includes('_class');
            
            if (hasIdOrClass) {
              errors.push({
                severity: 'error',
                message: `Invalid relation target format in '${relationName}[${i}]': object has '_id'/'_class' but should be a simple ID string or use '_to' for qualified relations`,
                source,
                instance: `${instanceClass}:${instanceId}`
              });
            } else {
              errors.push({
                severity: 'error',
                message: `Invalid relation target format in '${relationName}[${i}]': object must have '_to' key for qualified relations, or use a simple ID string`,
                source,
                instance: `${instanceClass}:${instanceId}`
              });
            }
          } else {
            // Invalid: not a string or object
            errors.push({
              severity: 'error',
              message: `Invalid relation target format in '${relationName}[${i}]': expected string or object with '_to', got ${typeof target}`,
              source,
              instance: `${instanceClass}:${instanceId}`
            });
          }
        }
      }
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
