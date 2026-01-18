/**
 * Query Lexer - Tokenize query strings into tokens
 * 
 * Supports two query patterns:
 * 1. Class property search: [id]:[Class][.property]: <value>
 * 2. Relation search: (from_id:Class)-[:RELATION].qualifier->: <value>
 * 3. Boolean operators: AND, OR, NOT, and () grouping
 */

/**
 * @typedef {Object} Token
 * @property {string} type
 * @property {string} value
 * @property {number} position
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
   * Peek at character at offset
   * @param {number} offset
   * @returns {string}
   */
  peek(offset = 1) {
    return this.input[this.position + offset] || '';
  }

  /**
   * Advance position and return current char
   * @returns {string}
   */
  advance() {
    return this.input[this.position++];
  }

  /**
   * Skip whitespace (but track it for context)
   * @returns {boolean} true if whitespace was skipped
   */
  skipWhitespace() {
    let skipped = false;
    while (!this.isAtEnd() && /\s/.test(this.current())) {
      this.advance();
      skipped = true;
    }
    return skipped;
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
   * Read a value (anything except special chars and whitespace)
   * Handles hyphens that are part of identifiers (not followed by [ or >)
   * @returns {string}
   */
  readValue() {
    let value = '';
    // Stop at special characters that have meaning in our DSL
    // But allow hyphens that are part of identifiers (not -[ or ->)
    while (!this.isAtEnd()) {
      const char = this.current();
      
      // Stop at whitespace or these special chars
      if (/[\s:()[\]>."]/.test(char)) {
        break;
      }
      
      // For hyphen, check if it's part of -[ or -> (relation syntax)
      if (char === '-') {
        const next = this.peek();
        if (next === '[' || next === '>') {
          break; // This is relation syntax, stop here
        }
        // Otherwise it's part of an identifier like "team-zulu"
      }
      
      value += this.advance();
    }
    return value;
  }

  /**
   * Check if we're looking at a relation pattern: -[
   * @returns {boolean}
   */
  isRelationStart() {
    return this.current() === '-' && this.peek() === '[';
  }

  /**
   * Check if we're looking at arrow: ->
   * @returns {boolean}
   */
  isArrow() {
    return this.current() === '-' && this.peek() === '>';
  }

  /**
   * Tokenize the input string
   * @returns {Token[]}
   */
  tokenize() {
    this.tokens = [];

    while (!this.isAtEnd()) {
      const hadWhitespace = this.skipWhitespace();
      if (this.isAtEnd()) break;

      const char = this.current();
      const start = this.position;

      // Two-character tokens first
      if (this.isArrow()) {
        this.advance();
        this.advance();
        this.tokens.push({ type: 'ARROW', value: '->', position: start });
        continue;
      }

      if (this.isRelationStart()) {
        this.advance(); // consume -
        this.advance(); // consume [
        this.tokens.push({ type: 'REL_START', value: '-[', position: start });
        continue;
      }

      // Single character tokens
      if (char === ':') {
        this.advance();
        // Check if followed by space (colon-space is VALUE_SEP)
        if (!this.isAtEnd() && this.current() === ' ') {
          this.tokens.push({ type: 'VALUE_SEP', value: ': ', position: start });
          this.advance(); // consume the space
          continue;
        }
        this.tokens.push({ type: 'COLON', value: ':', position: start });
        continue;
      }

      if (char === '.') {
        this.advance();
        this.tokens.push({ type: 'DOT', value: '.', position: start });
        continue;
      }

      if (char === '(') {
        this.advance();
        this.tokens.push({ type: 'LPAREN', value: '(', position: start });
        continue;
      }

      if (char === ')') {
        this.advance();
        this.tokens.push({ type: 'RPAREN', value: ')', position: start });
        continue;
      }

      if (char === '[') {
        this.advance();
        this.tokens.push({ type: 'LBRACKET', value: '[', position: start });
        continue;
      }

      if (char === ']') {
        this.advance();
        this.tokens.push({ type: 'RBRACKET', value: ']', position: start });
        continue;
      }

      if (char === '-') {
        // Standalone dash (not part of -> or -[)
        this.advance();
        this.tokens.push({ type: 'DASH', value: '-', position: start });
        continue;
      }

      if (char === '"' || char === "'") {
        this.tokens.push(this.readQuotedString());
        continue;
      }

      // Read a word (identifier or value)
      const word = this.readValue();
      if (word) {
        // Check if it's a keyword (AND, OR, NOT)
        if (KEYWORDS.has(word.toUpperCase())) {
          this.tokens.push({ type: word.toUpperCase(), value: word, position: start });
        } else {
          this.tokens.push({ type: 'WORD', value: word, position: start });
        }
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
