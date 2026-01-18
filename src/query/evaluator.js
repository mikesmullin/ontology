/**
 * Query Evaluator - Evaluate AST against instances
 */

/**
 * @typedef {import('../core/types.js').ASTNode} ASTNode
 * @typedef {import('../core/types.js').MatchNode} MatchNode
 * @typedef {import('../core/types.js').ClassInstance} ClassInstance
 * @typedef {import('../core/types.js').RelationInstance} RelationInstance
 */

import { matchValue, matchAnyField } from './matchers.js';

/**
 * Evaluate an AST node against an instance
 * @param {ASTNode} node - The AST node to evaluate
 * @param {ClassInstance | RelationInstance} instance - The instance to match against
 * @returns {boolean}
 */
export function evaluate(node, instance) {
  switch (node.type) {
    case 'AND':
      return evaluate(node.left, instance) && evaluate(node.right, instance);

    case 'OR':
      return evaluate(node.left, instance) || evaluate(node.right, instance);

    case 'NOT':
      return !evaluate(node.operand, instance);

    case 'MATCH':
      return evaluateMatch(node, instance);

    default:
      throw new Error(`Unknown AST node type: ${node.type}`);
  }
}

/**
 * Evaluate a match node against an instance
 * @param {MatchNode} node - The match node
 * @param {ClassInstance | RelationInstance} instance - The instance to match against
 * @returns {boolean}
 */
function evaluateMatch(node, instance) {
  const { field, value, matchType } = node;

  // Bare search (no field specified) - search all fields
  if (field === null) {
    return matchAnyField(instance, value, matchType);
  }

  // Field-specific search
  const fieldValue = instance[field];
  return matchValue(fieldValue, value, matchType);
}

/**
 * Filter instances by evaluating AST
 * @param {ASTNode} ast - The parsed query AST
 * @param {(ClassInstance | RelationInstance)[]} instances - Instances to filter
 * @returns {(ClassInstance | RelationInstance)[]}
 */
export function filterInstances(ast, instances) {
  return instances.filter(instance => evaluate(ast, instance));
}

/**
 * Filter and categorize instances
 * @param {ASTNode} ast - The parsed query AST
 * @param {{ classes: ClassInstance[], relations: RelationInstance[] }} instances
 * @returns {{ classes: ClassInstance[], relations: RelationInstance[] }}
 */
export function filterAll(ast, instances) {
  return {
    classes: instances.classes.filter(instance => evaluate(ast, instance)),
    relations: instances.relations.filter(instance => evaluate(ast, instance))
  };
}
