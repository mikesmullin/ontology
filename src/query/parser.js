/**
 * Query Parser - Parse tokens into an AST
 * 
 * Grammar (EBNF):
 *   query           = expression ;
 *   expression      = term { OR term } ;
 *   term            = factor { AND factor } ;
 *   factor          = NOT factor | LPAREN expression RPAREN | match ;
 *   match           = relation_match | class_match ;
 *   
 *   relation_match  = [ entity_spec ] REL_START [ COLON WORD ] RBRACKET [ DOT WORD ] ARROW [ VALUE_SEP value ] ;
 *   entity_spec     = LPAREN [ id ] [ COLON class ] RPAREN ;
 *   
 *   class_match     = [ id ] COLON [ class ] [ DOT property ] VALUE_SEP value
 *                   | [ id ] COLON [ class ] VALUE_SEP value
 *                   | [ id ] COLON COLON value
 *                   | bare_value ;
 *   
 *   bare_value      = WORD | QUOTED_VALUE ;
 */

/**
 * @typedef {Object} ClassMatchNode
 * @property {'CLASS_MATCH'} type
 * @property {string|null} id - Filter by _id
 * @property {string|null} className - Filter by _class
 * @property {string|null} property - Filter by specific property
 * @property {string|null} value - Value pattern to match (wildcard)
 */

/**
 * @typedef {Object} RelationMatchNode
 * @property {'RELATION_MATCH'} type
 * @property {string|null} fromId - Filter by source _id
 * @property {string|null} fromClass - Filter by source _class
 * @property {string|null} relationType - Filter by relation type
 * @property {string|null} qualifier - Filter by qualifier name
 * @property {string|null} value - Value pattern for qualifier or target
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
 * @typedef {ClassMatchNode | RelationMatchNode | AndNode | OrNode | NotNode} ASTNode
 */

/**
 * Parser class for building AST from tokens
 */
export class Parser {
  /**
   * @param {import('./lexer.js').Token[]} tokens
   */
  constructor(tokens) {
    this.tokens = tokens;
    this.position = 0;
  }

  /**
   * Get current token
   * @returns {import('./lexer.js').Token}
   */
  current() {
    return this.tokens[this.position];
  }

  /**
   * Peek at token at offset
   * @param {number} offset
   * @returns {import('./lexer.js').Token|undefined}
   */
  peek(offset = 1) {
    return this.tokens[this.position + offset];
  }

  /**
   * Check if current token matches type
   * @param {string} type
   * @returns {boolean}
   */
  check(type) {
    return this.current()?.type === type;
  }

  /**
   * Consume current token if it matches type
   * @param {string} type
   * @returns {import('./lexer.js').Token | null}
   */
  match(type) {
    if (this.check(type)) {
      return this.advance();
    }
    return null;
  }

  /**
   * Advance to next token and return previous
   * @returns {import('./lexer.js').Token}
   */
  advance() {
    const token = this.current();
    if (!this.check('EOF')) {
      this.position++;
    }
    return token;
  }

  /**
   * Expect a token of given type or throw
   * @param {string} type
   * @param {string} message
   * @returns {import('./lexer.js').Token}
   */
  expect(type, message) {
    if (this.check(type)) {
      return this.advance();
    }
    throw new SyntaxError(`${message} at position ${this.current()?.position || 0}`);
  }

  /**
   * Check if we're looking at a relation match pattern
   * Relation patterns start with: -[ or (-[ or (id)-[ or (id:Class)-[
   * @returns {boolean}
   */
  isRelationPattern() {
    let pos = this.position;
    
    // Check for direct -[ start
    if (this.tokens[pos]?.type === 'REL_START') {
      return true;
    }
    
    // Check for (...)- pattern
    if (this.tokens[pos]?.type === 'LPAREN') {
      // Skip ahead to find matching RPAREN then -[
      let depth = 1;
      pos++;
      while (pos < this.tokens.length && depth > 0) {
        if (this.tokens[pos].type === 'LPAREN') depth++;
        if (this.tokens[pos].type === 'RPAREN') depth--;
        pos++;
      }
      // After RPAREN, check for -[
      if (this.tokens[pos]?.type === 'REL_START') {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Check if we're looking at a class match pattern
   * Patterns start with COLON or WORD followed by COLON
   * @returns {boolean}
   */
  isClassMatchPattern() {
    // If starts with COLON, it's a class match pattern like :Person...
    if (this.check('COLON')) {
      return true;
    }
    
    // If starts with WORD, check if followed by COLON (like id:Class...)
    if (this.check('WORD') && this.peek()?.type === 'COLON') {
      return true;
    }
    
    return false;
  }

  /**
   * Parse the query
   * @returns {ASTNode}
   */
  parse() {
    if (this.check('EOF')) {
      throw new SyntaxError('Empty query');
    }
    const result = this.parseExpression();
    if (!this.check('EOF')) {
      throw new SyntaxError(`Unexpected token '${this.current().value}' at position ${this.current().position}`);
    }
    return result;
  }

  /**
   * Parse expression (handles OR)
   * @returns {ASTNode}
   */
  parseExpression() {
    let left = this.parseTerm();

    while (this.match('OR')) {
      const right = this.parseTerm();
      left = { type: 'OR', left, right };
    }

    return left;
  }

  /**
   * Parse term (handles AND)
   * @returns {ASTNode}
   */
  parseTerm() {
    let left = this.parseFactor();

    while (this.match('AND')) {
      const right = this.parseFactor();
      left = { type: 'AND', left, right };
    }

    return left;
  }

  /**
   * Parse factor (handles NOT, grouping, and matches)
   * @returns {ASTNode}
   */
  parseFactor() {
    // NOT factor
    if (this.match('NOT')) {
      const operand = this.parseFactor();
      return { type: 'NOT', operand };
    }

    // Check for relation pattern first (before LPAREN grouping check)
    if (this.isRelationPattern()) {
      return this.parseRelationMatch();
    }

    // Grouped expression (but only if not a relation pattern)
    if (this.check('LPAREN') && !this.isRelationPattern()) {
      this.advance(); // consume LPAREN
      const expr = this.parseExpression();
      this.expect('RPAREN', 'Expected closing parenthesis');
      return expr;
    }

    // Check for class match pattern
    if (this.isClassMatchPattern()) {
      return this.parseClassMatch();
    }

    // Bare value (search all fields)
    return this.parseBareValue();
  }

  /**
   * Parse a bare value search (searches all properties)
   * @returns {ClassMatchNode}
   */
  parseBareValue() {
    const token = this.current();
    
    if (token.type === 'WORD' || token.type === 'QUOTED_VALUE') {
      const value = this.advance().value;
      return {
        type: 'CLASS_MATCH',
        id: null,
        className: null,
        property: null,
        value
      };
    }

    throw new SyntaxError(`Unexpected token '${token.value}' at position ${token.position}`);
  }

  /**
   * Parse a class match expression
   * Patterns:
   *   id:Class.property: value
   *   :Class.property: value
   *   id:Class: value
   *   :Class: value
   *   id:: value
   *   :Class.property:  (empty value = list all)
   * @returns {ClassMatchNode}
   */
  parseClassMatch() {
    let id = null;
    let className = null;
    let property = null;
    let value = null;

    // Check if starts with a word (could be id)
    if (this.check('WORD')) {
      id = this.advance().value;
    }

    // Expect first colon
    this.expect('COLON', 'Expected ":" in class match');

    // Check for class name
    if (this.check('WORD')) {
      className = this.advance().value;
    }

    // Check for .property
    if (this.match('DOT')) {
      if (this.check('WORD')) {
        property = this.advance().value;
      }
    }

    // Check for VALUE_SEP (": ") followed by value
    if (this.match('VALUE_SEP')) {
      // Value is optional (empty means list all)
      if (this.check('WORD') || this.check('QUOTED_VALUE')) {
        value = this.advance().value;
      }
    } else if (this.match('COLON')) {
      // Second colon (for id:: value pattern)
      if (this.check('WORD') || this.check('QUOTED_VALUE')) {
        value = this.advance().value;
      }
    }

    return {
      type: 'CLASS_MATCH',
      id,
      className,
      property,
      value
    };
  }

  /**
   * Parse a relation match expression
   * Patterns:
   *   -[:RELATION]->
   *   -[:RELATION].qualifier->
   *   -[:RELATION].qualifier->: value
   *   (id)-[:RELATION]->
   *   (id:Class)-[:RELATION]->
   *   (:Class)-[:RELATION].qualifier->: value
   * @returns {RelationMatchNode}
   */
  parseRelationMatch() {
    let fromId = null;
    let fromClass = null;
    let relationType = null;
    let qualifier = null;
    let value = null;

    // Parse optional entity spec: (id:Class)
    if (this.match('LPAREN')) {
      // Check for id
      if (this.check('WORD')) {
        fromId = this.advance().value;
      }
      
      // Check for :Class
      if (this.match('COLON')) {
        if (this.check('WORD')) {
          fromClass = this.advance().value;
        }
      }
      
      this.expect('RPAREN', 'Expected ")" after entity spec');
    }

    // Parse -[:RELATION]
    this.expect('REL_START', 'Expected "-[" for relation');
    
    // Optional : before relation name
    this.match('COLON');
    
    // Optional relation name
    if (this.check('WORD')) {
      relationType = this.advance().value;
    }
    
    this.expect('RBRACKET', 'Expected "]" after relation name');

    // Check for .qualifier
    if (this.match('DOT')) {
      if (this.check('WORD')) {
        qualifier = this.advance().value;
      }
    }

    // Expect ->
    this.expect('ARROW', 'Expected "->" after relation');

    // Check for VALUE_SEP (": ") followed by value
    if (this.match('VALUE_SEP')) {
      // Value is optional
      if (this.check('WORD') || this.check('QUOTED_VALUE')) {
        value = this.advance().value;
      }
    } else if (this.match('COLON')) {
      // Also accept just : followed by value
      if (this.check('WORD') || this.check('QUOTED_VALUE')) {
        value = this.advance().value;
      }
    }

    return {
      type: 'RELATION_MATCH',
      fromId,
      fromClass,
      relationType,
      qualifier,
      value
    };
  }
}

/**
 * Parse tokens into an AST
 * @param {import('./lexer.js').Token[]} tokens
 * @returns {ASTNode}
 */
export function parse(tokens) {
  const parser = new Parser(tokens);
  return parser.parse();
}