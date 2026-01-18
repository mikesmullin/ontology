/**
 * Query Parser - Parse tokens into an AST
 * 
 * Grammar (EBNF):
 *   query       = expression ;
 *   expression  = term { OR term } ;
 *   term        = factor { AND factor } ;
 *   factor      = NOT factor | LPAREN expression RPAREN | match ;
 *   match       = [ field COLON ] value ;
 */

/**
 * @typedef {import('../core/types.js').Token} Token
 * @typedef {import('../core/types.js').ASTNode} ASTNode
 * @typedef {import('../core/types.js').MatchNode} MatchNode
 */

/**
 * Check if a value contains wildcard characters
 * @param {string} value
 * @returns {boolean}
 */
function hasWildcard(value) {
  return value.includes('*') || value.includes('?');
}

/**
 * Parser class for building AST from tokens
 */
export class Parser {
  /**
   * @param {Token[]} tokens
   */
  constructor(tokens) {
    this.tokens = tokens;
    this.position = 0;
  }

  /**
   * Get current token
   * @returns {Token}
   */
  current() {
    return this.tokens[this.position];
  }

  /**
   * Peek at next token
   * @returns {Token}
   */
  peek() {
    return this.tokens[this.position + 1];
  }

  /**
   * Check if current token matches type
   * @param {string} type
   * @returns {boolean}
   */
  check(type) {
    return this.current().type === type;
  }

  /**
   * Consume current token if it matches type
   * @param {string} type
   * @returns {Token | null}
   */
  match(type) {
    if (this.check(type)) {
      return this.advance();
    }
    return null;
  }

  /**
   * Advance to next token and return previous
   * @returns {Token}
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
   * @returns {Token}
   */
  expect(type, message) {
    if (this.check(type)) {
      return this.advance();
    }
    throw new SyntaxError(`${message} at position ${this.current().position}`);
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

    // Grouped expression
    if (this.match('LPAREN')) {
      const expr = this.parseExpression();
      this.expect('RPAREN', 'Expected closing parenthesis');
      return expr;
    }

    // Match (field:value or bare value)
    return this.parseMatch();
  }

  /**
   * Parse a match expression (field:value or bare value)
   * @returns {MatchNode}
   */
  parseMatch() {
    const token = this.current();

    // Check if this is a field:value pair
    if ((token.type === 'VALUE' || token.type === 'QUOTED_VALUE') && this.peek()?.type === 'COLON') {
      const field = this.advance().value;
      this.advance(); // consume colon
      const valueToken = this.advance();
      const value = valueToken.value;

      return {
        type: 'MATCH',
        field,
        value,
        matchType: hasWildcard(value) ? 'wildcard' : 'exact'
      };
    }

    // Bare value (search all fields)
    if (token.type === 'VALUE' || token.type === 'QUOTED_VALUE') {
      const value = this.advance().value;
      return {
        type: 'MATCH',
        field: null,
        value,
        matchType: hasWildcard(value) ? 'wildcard' : 'exact'
      };
    }

    throw new SyntaxError(`Unexpected token '${token.value}' at position ${token.position}`);
  }
}

/**
 * Parse a query string into an AST
 * @param {Token[]} tokens
 * @returns {ASTNode}
 */
export function parse(tokens) {
  const parser = new Parser(tokens);
  return parser.parse();
}
