/**
 * TypeScript-like JSDoc types for the ontology system
 */

/**
 * @typedef {Object} PropertyDef
 * @property {'string' | 'bool' | 'date'} type
 * @property {boolean} [required]
 */

/**
 * @typedef {Object} ClassDef
 * @property {Record<string, PropertyDef>} [properties]
 */

/**
 * @typedef {Object} CardinalityDef
 * @property {number} min
 * @property {number | 'many'} max
 */

/**
 * @typedef {Object} QualifierDef
 * @property {'string' | 'bool' | 'date'} type
 */

/**
 * @typedef {Object} RelationDef
 * @property {string} domain
 * @property {string} range
 * @property {CardinalityDef} cardinality
 * @property {Record<string, QualifierDef>} [qualifiers]
 */

/**
 * @typedef {Object} OntologyMetadata
 * @property {string} namespace
 */

/**
 * @typedef {Object} OntologySchema
 * @property {Record<string, ClassDef>} [classes]
 * @property {Record<string, RelationDef>} [relations]
 */

/**
 * @typedef {Object} OntologySpec
 * @property {ClassInstance[]} [classes]
 * @property {RelationInstance[]} [relations]
 */

/**
 * @typedef {Object} OntologyDocument
 * @property {string} apiVersion
 * @property {'Ontology'} kind
 * @property {OntologyMetadata} [metadata]
 * @property {OntologySchema} [schema]
 * @property {OntologySpec} [spec]
 */

/**
 * @typedef {Object} ClassInstance
 * @property {string} _class
 * @property {string} _id
 * @property {string} [_namespace]
 * @property {string} [_source]
 * @property {*} [key: string]
 */

/**
 * @typedef {Object} RelationInstance
 * @property {string} _from
 * @property {string} _relation
 * @property {string} _to
 * @property {string} [_namespace]
 * @property {string} [_source]
 * @property {*} [key: string]
 */

/**
 * @typedef {Object} LoadedSchema
 * @property {Record<string, ClassDef>} classes
 * @property {Record<string, RelationDef>} relations
 * @property {Set<string>} namespaces
 */

/**
 * @typedef {Object} LoadedInstances
 * @property {ClassInstance[]} classes
 * @property {RelationInstance[]} relations
 */

/**
 * @typedef {Object} LoadedData
 * @property {LoadedSchema} schema
 * @property {LoadedInstances} instances
 * @property {string[]} files
 */

/**
 * @typedef {'FIELD' | 'COLON' | 'VALUE' | 'QUOTED_VALUE' | 'AND' | 'OR' | 'NOT' | 'LPAREN' | 'RPAREN' | 'EOF'} TokenType
 */

/**
 * @typedef {Object} Token
 * @property {TokenType} type
 * @property {string} value
 * @property {number} position
 */

/**
 * @typedef {'AND' | 'OR' | 'NOT' | 'MATCH'} ASTNodeType
 */

/**
 * @typedef {Object} MatchNode
 * @property {'MATCH'} type
 * @property {string | null} field
 * @property {string} value
 * @property {'exact' | 'wildcard'} matchType
 */

/**
 * @typedef {Object} AndNode
 * @property {'AND'} type
 * @property {ASTNode} left
 * @property {ASTNode} right
 */

/**
 * @typedef {Object} OrNode
 * @property {'OR'} type
 * @property {ASTNode} left
 * @property {ASTNode} right
 */

/**
 * @typedef {Object} NotNode
 * @property {'NOT'} type
 * @property {ASTNode} operand
 */

/**
 * @typedef {MatchNode | AndNode | OrNode | NotNode} ASTNode
 */

/**
 * @typedef {Object} SearchMatch
 * @property {'class' | 'relation'} type
 * @property {ClassInstance | RelationInstance} instance
 * @property {string} source
 */

export {};
