/**
 * Query Lexer - Tokenize query strings into tokens
 */

/**
 * @typedef {import('../core/types.js').Token} Token
 * @typedef {import('../core/types.js').TokenType} TokenType
 */

const KEYWORDS = new Set(['AND', 'OR', 'NOT']);

/**
 * Lexer class for tokenizing query strings
 */
export class Lexer {
  /**
   * @param {string} input
   */
  constructor(input) {
    this.input = input;
    this.position = 0;
    this.tokens = [];
  }

  /**
   * Check if we're at end of input
   * @returns {boolean}
   */
  isAtEnd() {
    return this.position >= this.input.length;
  }

  /**
   * Get current character
   * @returns {string}
   */
  current() {
    return this.input[this.position];
  }

  /**
   * Peek at next character
   * @returns {string}
   */
  peek() {
    return this.input[this.position + 1];
  }

  /**
   * Advance position and return current char
   * @returns {string}
   */
  advance() {
    return this.input[this.position++];
  }

  /**
   * Skip whitespace
   */
  skipWhitespace() {
    while (!this.isAtEnd() && /\s/.test(this.current())) {
      this.advance();
    }
  }

  /**
   * Read a quoted string
   * @returns {Token}
   */
  readQuotedString() {
    const start = this.position;
    const quote = this.advance(); // consume opening quote
    let value = '';

    while (!this.isAtEnd() && this.current() !== quote) {
      if (this.current() === '\\' && this.peek() === quote) {
        this.advance(); // skip backslash
      }
      value += this.advance();
    }

    if (!this.isAtEnd()) {
      this.advance(); // consume closing quote
    }

    return { type: 'QUOTED_VALUE', value, position: start };
  }

  /**
   * Read an unquoted value or identifier
   * @returns {Token}
   */
  readWord() {
    const start = this.position;
    let value = '';

    while (!this.isAtEnd() && /[^\s:()"]/.test(this.current())) {
      value += this.advance();
    }

    // Check if it's a keyword
    if (KEYWORDS.has(value.toUpperCase())) {
      return { type: value.toUpperCase(), value, position: start };
    }

    return { type: 'VALUE', value, position: start };
  }

  /**
   * Tokenize the input string
   * @returns {Token[]}
   */
  tokenize() {
    this.tokens = [];

    while (!this.isAtEnd()) {
      this.skipWhitespace();
      if (this.isAtEnd()) break;

      const char = this.current();
      const start = this.position;

      if (char === ':') {
        this.advance();
        this.tokens.push({ type: 'COLON', value: ':', position: start });
      } else if (char === '(') {
        this.advance();
        this.tokens.push({ type: 'LPAREN', value: '(', position: start });
      } else if (char === ')') {
        this.advance();
        this.tokens.push({ type: 'RPAREN', value: ')', position: start });
      } else if (char === '"' || char === "'") {
        this.tokens.push(this.readQuotedString());
      } else {
        this.tokens.push(this.readWord());
      }
    }

    this.tokens.push({ type: 'EOF', value: '', position: this.position });
    return this.tokens;
  }
}

/**
 * Tokenize a query string
 * @param {string} query
 * @returns {Token[]}
 */
export function tokenize(query) {
  const lexer = new Lexer(query);
  return lexer.tokenize();
}
