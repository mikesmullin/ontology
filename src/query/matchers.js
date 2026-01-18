/**
 * Matchers - Pattern matching utilities for query evaluation
 * 
 * Uses case-insensitive "contains" matching by default (like *value*)
 */

/**
 * Check if a value contains the search pattern (case-insensitive)
 * This is the primary matching function - always uses "contains" semantics
 * @param {*} fieldValue - The value from the instance field
 * @param {string} pattern - The pattern to search for
 * @returns {boolean}
 */
export function wildcardContains(fieldValue, pattern) {
  if (fieldValue === null || fieldValue === undefined) {
    return false;
  }

  const normalizedField = String(fieldValue).toLowerCase();
  const normalizedPattern = pattern.toLowerCase();

  // Simple contains match
  return normalizedField.includes(normalizedPattern);
}

/**
 * Check if any property in an object contains the search value
 * @param {Object} instance - The instance to search
 * @param {string} pattern - The pattern to search for
 * @returns {boolean}
 */
export function matchAnyProperty(instance, pattern) {
  for (const [key, value] of Object.entries(instance)) {
    // Skip internal fields except _class and _id
    if (key.startsWith('_') && key !== '_class' && key !== '_id') {
      continue;
    }
    
    if (wildcardContains(value, pattern)) {
      return true;
    }
  }
  return false;
}

/**
 * Find the match position in a string for highlighting
 * @param {string} text - The text to search in
 * @param {string} pattern - The pattern to find
 * @returns {{ start: number, end: number } | null}
 */
export function findMatchPosition(text, pattern) {
  const normalizedText = text.toLowerCase();
  const normalizedPattern = pattern.toLowerCase();
  
  const start = normalizedText.indexOf(normalizedPattern);
  if (start === -1) {
    return null;
  }
  
  return {
    start,
    end: start + pattern.length
  };
}

/**
 * Highlight matched text with ANSI colors
 * @param {string} text - The original text
 * @param {string} pattern - The pattern that matched
 * @returns {string}
 */
export function highlightMatch(text, pattern) {
  const position = findMatchPosition(text, pattern);
  if (!position) {
    return text;
  }
  
  const before = text.slice(0, position.start);
  const match = text.slice(position.start, position.end);
  const after = text.slice(position.end);
  
  // ANSI red color
  const RED = '\x1b[31m';
  const RESET = '\x1b[0m';
  
  return `${before}${RED}${match}${RESET}${after}`;
}

// Legacy exports for backward compatibility
export { wildcardContains as matchValue };
export { matchAnyProperty as matchAnyField };
