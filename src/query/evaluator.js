/**
 * Query Evaluator - Evaluate AST against instances
 * 
 * Returns detailed match information including line numbers and matched properties.
 */

import { wildcardContains, matchAnyProperty } from './matchers.js';

/**
 * @typedef {import('../core/types.js').ClassInstance} ClassInstance
 * @typedef {import('../core/types.js').RelationInstance} RelationInstance
 * @typedef {import('./parser.js').ASTNode} ASTNode
 * @typedef {import('./parser.js').ClassMatchNode} ClassMatchNode
 * @typedef {import('./parser.js').RelationMatchNode} RelationMatchNode
 */

/**
 * @typedef {Object} PropertyMatch
 * @property {string} property - Property name that matched
 * @property {string} value - The value that matched
 * @property {number} lineNumber - Line number in source file
 * @property {string} matchedText - The text that matched the pattern
 */

/**
 * @typedef {Object} ClassSearchResult
 * @property {'class'} type
 * @property {ClassInstance} instance
 * @property {PropertyMatch[]} matches - Which properties matched
 */

/**
 * @typedef {Object} RelationSearchResult
 * @property {'relation'} type
 * @property {RelationInstance} relation
 * @property {ClassInstance} fromInstance
 * @property {ClassInstance|null} toInstance
 * @property {string|null} matchedQualifier
 * @property {string|null} matchedValue
 */

/**
 * @typedef {ClassSearchResult | RelationSearchResult} SearchResult
 */

/**
 * Evaluate an AST node to check if it matches (boolean only)
 * @param {ASTNode} node
 * @param {ClassInstance} classInstance
 * @param {RelationInstance[]} relations - Relations for this class instance
 * @param {Map<string, ClassInstance>} instancesById
 * @returns {boolean}
 */
export function evaluateBoolean(node, classInstance, relations, instancesById) {
  switch (node.type) {
    case 'AND':
      return evaluateBoolean(node.left, classInstance, relations, instancesById) && 
             evaluateBoolean(node.right, classInstance, relations, instancesById);

    case 'OR':
      return evaluateBoolean(node.left, classInstance, relations, instancesById) || 
             evaluateBoolean(node.right, classInstance, relations, instancesById);

    case 'NOT':
      return !evaluateBoolean(node.operand, classInstance, relations, instancesById);

    case 'CLASS_MATCH':
      return evaluateClassMatchBoolean(node, classInstance);

    case 'RELATION_MATCH':
      return evaluateRelationMatchBoolean(node, classInstance, relations, instancesById);

    default:
      throw new Error(`Unknown AST node type: ${node.type}`);
  }
}

/**
 * Evaluate a class match node (boolean)
 * @param {ClassMatchNode} node
 * @param {ClassInstance} instance
 * @returns {boolean}
 */
function evaluateClassMatchBoolean(node, instance) {
  // Filter by _id if specified
  if (node.id !== null && instance._id !== node.id) {
    return false;
  }

  // Filter by _class if specified
  if (node.className !== null && instance._class !== node.className) {
    return false;
  }

  // If no value specified, just check if instance exists with matching id/class
  if (node.value === null) {
    return true;
  }

  // If property specified, check just that property
  if (node.property !== null) {
    const propValue = instance[node.property];
    return wildcardContains(propValue, node.value);
  }

  // Search all properties
  return matchAnyProperty(instance, node.value);
}

/**
 * Evaluate a relation match node (boolean)
 * @param {RelationMatchNode} node
 * @param {ClassInstance} classInstance
 * @param {RelationInstance[]} relations
 * @param {Map<string, ClassInstance>} instancesById
 * @returns {boolean}
 */
function evaluateRelationMatchBoolean(node, classInstance, relations, instancesById) {
  // Filter by from id
  if (node.fromId !== null && classInstance._id !== node.fromId) {
    return false;
  }

  // Filter by from class
  if (node.fromClass !== null && classInstance._class !== node.fromClass) {
    return false;
  }

  // Check if any relation matches
  for (const rel of relations) {
    // Filter by relation type
    if (node.relationType !== null && rel._relation !== node.relationType) {
      continue;
    }

    // Filter by qualifier existence
    if (node.qualifier !== null) {
      if (!(node.qualifier in rel)) {
        continue;
      }

      // Filter by qualifier value if specified
      if (node.value !== null) {
        const qualValue = rel[node.qualifier];
        if (!wildcardContains(qualValue, node.value)) {
          continue;
        }
      }
    } else if (node.value !== null) {
      // Value specified but no qualifier - match against _to
      if (!wildcardContains(rel._to, node.value)) {
        continue;
      }
    }

    // This relation matches
    return true;
  }

  return false;
}

/**
 * Find all matching results for a query
 * @param {ASTNode} ast
 * @param {{ classes: ClassInstance[], relations: RelationInstance[] }} instances
 * @param {Object} [options]
 * @param {Map<string, number[]>} [options.lineNumbers] - Map of source file to property line numbers
 * @returns {SearchResult[]}
 */
export function findMatches(ast, instances, options = {}) {
  const results = [];
  
  // Build instance lookup
  const instancesById = new Map();
  for (const instance of instances.classes) {
    instancesById.set(instance._id, instance);
  }
  
  // Group relations by _from
  const relationsByFrom = new Map();
  for (const rel of instances.relations) {
    if (!relationsByFrom.has(rel._from)) {
      relationsByFrom.set(rel._from, []);
    }
    relationsByFrom.get(rel._from).push(rel);
  }

  // Process each class instance
  for (const classInstance of instances.classes) {
    const classRelations = relationsByFrom.get(classInstance._id) || [];
    
    // Check if this instance matches
    if (evaluateBoolean(ast, classInstance, classRelations, instancesById)) {
      // Collect detailed match info
      const classResults = collectClassMatches(ast, classInstance);
      const relationResults = collectRelationMatches(ast, classInstance, classRelations, instancesById);
      
      results.push(...classResults);
      results.push(...relationResults);
    }
  }

  return results;
}

/**
 * Collect class property matches from an AST
 * @param {ASTNode} ast
 * @param {ClassInstance} instance
 * @returns {ClassSearchResult[]}
 */
function collectClassMatches(ast, instance) {
  const results = [];
  collectClassMatchesRecursive(ast, instance, results);
  return results;
}

/**
 * Recursively collect class matches
 * @param {ASTNode} node
 * @param {ClassInstance} instance
 * @param {ClassSearchResult[]} results
 */
function collectClassMatchesRecursive(node, instance, results) {
  switch (node.type) {
    case 'AND':
    case 'OR':
      collectClassMatchesRecursive(node.left, instance, results);
      collectClassMatchesRecursive(node.right, instance, results);
      break;
    
    case 'NOT':
      // Don't collect matches from NOT clauses
      break;
    
    case 'CLASS_MATCH':
      const matches = findPropertyMatches(node, instance);
      if (matches.length > 0) {
        results.push({
          type: 'class',
          instance,
          matches
        });
      }
      break;
  }
}

/**
 * Find which properties match a class match node
 * @param {ClassMatchNode} node
 * @param {ClassInstance} instance
 * @returns {PropertyMatch[]}
 */
function findPropertyMatches(node, instance) {
  const matches = [];

  // Filter by _id if specified
  if (node.id !== null && instance._id !== node.id) {
    return matches;
  }

  // Filter by _class if specified
  if (node.className !== null && instance._class !== node.className) {
    return matches;
  }

  // If property specified with no value (list all), show that property
  if (node.property !== null && node.value === null) {
    const propValue = instance[node.property];
    if (propValue !== undefined && propValue !== null) {
      matches.push({
        property: node.property,
        value: String(propValue),
        lineNumber: 0,
        matchedText: ''
      });
    }
    return matches;
  }

  // If no value and no property specified, just check existence (no matches to show)
  if (node.value === null) {
    return matches;
  }

  // If property specified, check just that property
  if (node.property !== null) {
    const propValue = instance[node.property];
    if (wildcardContains(propValue, node.value)) {
      matches.push({
        property: node.property,
        value: String(propValue),
        lineNumber: 0, // Will be filled in by formatter
        matchedText: node.value
      });
    }
    return matches;
  }

  // Search all properties
  for (const [key, value] of Object.entries(instance)) {
    if (key.startsWith('_') && key !== '_class' && key !== '_id') {
      continue;
    }
    if (wildcardContains(value, node.value)) {
      matches.push({
        property: key,
        value: String(value),
        lineNumber: 0,
        matchedText: node.value
      });
    }
  }

  return matches;
}

/**
 * Collect relation matches from an AST
 * @param {ASTNode} ast
 * @param {ClassInstance} classInstance
 * @param {RelationInstance[]} relations
 * @param {Map<string, ClassInstance>} instancesById
 * @returns {RelationSearchResult[]}
 */
function collectRelationMatches(ast, classInstance, relations, instancesById) {
  const results = [];
  collectRelationMatchesRecursive(ast, classInstance, relations, instancesById, results);
  return results;
}

/**
 * Recursively collect relation matches
 * @param {ASTNode} node
 * @param {ClassInstance} classInstance
 * @param {RelationInstance[]} relations
 * @param {Map<string, ClassInstance>} instancesById
 * @param {RelationSearchResult[]} results
 */
function collectRelationMatchesRecursive(node, classInstance, relations, instancesById, results) {
  switch (node.type) {
    case 'AND':
    case 'OR':
      collectRelationMatchesRecursive(node.left, classInstance, relations, instancesById, results);
      collectRelationMatchesRecursive(node.right, classInstance, relations, instancesById, results);
      break;
    
    case 'NOT':
      // Don't collect matches from NOT clauses
      break;
    
    case 'RELATION_MATCH':
      const matches = findRelationMatches(node, classInstance, relations, instancesById);
      results.push(...matches);
      break;
  }
}

/**
 * Find which relations match a relation match node
 * @param {RelationMatchNode} node
 * @param {ClassInstance} classInstance
 * @param {RelationInstance[]} relations
 * @param {Map<string, ClassInstance>} instancesById
 * @returns {RelationSearchResult[]}
 */
function findRelationMatches(node, classInstance, relations, instancesById) {
  const results = [];

  // Filter by from id
  if (node.fromId !== null && classInstance._id !== node.fromId) {
    return results;
  }

  // Filter by from class
  if (node.fromClass !== null && classInstance._class !== node.fromClass) {
    return results;
  }

  for (const rel of relations) {
    // Filter by relation type
    if (node.relationType !== null && rel._relation !== node.relationType) {
      continue;
    }

    let matchedQualifier = null;
    let matchedValue = null;

    // Filter by qualifier existence
    if (node.qualifier !== null) {
      if (!(node.qualifier in rel)) {
        continue;
      }

      matchedQualifier = node.qualifier;

      // Filter by qualifier value if specified
      if (node.value !== null) {
        const qualValue = rel[node.qualifier];
        if (!wildcardContains(qualValue, node.value)) {
          continue;
        }
        matchedValue = String(qualValue);
      }
    } else if (node.value !== null) {
      // Value specified but no qualifier - match against _to
      if (!wildcardContains(rel._to, node.value)) {
        continue;
      }
      matchedValue = rel._to;
    }

    // This relation matches
    const toInstance = instancesById.get(rel._to) || null;
    results.push({
      type: 'relation',
      relation: rel,
      fromInstance: classInstance,
      toInstance,
      matchedQualifier,
      matchedValue
    });
  }

  return results;
}

/**
 * Filter instances by evaluating AST (legacy compatibility)
 * @param {ASTNode} ast
 * @param {{ classes: ClassInstance[], relations: RelationInstance[] }} instances
 * @returns {{ classes: ClassInstance[], relations: RelationInstance[] }}
 */
export function filterAll(ast, instances) {
  const results = findMatches(ast, instances);
  
  const classSet = new Set();
  const relationSet = new Set();
  
  for (const result of results) {
    if (result.type === 'class') {
      classSet.add(result.instance);
    } else if (result.type === 'relation') {
      relationSet.add(result.relation);
    }
  }
  
  return {
    classes: Array.from(classSet),
    relations: Array.from(relationSet)
  };
}
