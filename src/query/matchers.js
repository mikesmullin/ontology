/**
 * Matchers - Pattern matching utilities for query evaluation
 */

/**
 * Check if a value exactly matches (case-insensitive)
 * @param {*} fieldValue - The value from the instance field
 * @param {string} queryValue - The value from the query
 * @returns {boolean}
 */
export function exactMatch(fieldValue, queryValue) {
  if (fieldValue === null || fieldValue === undefined) {
    return false;
  }

  const normalizedField = String(fieldValue).toLowerCase();
  const normalizedQuery = queryValue.toLowerCase();

  return normalizedField === normalizedQuery;
}

/**
 * Convert wildcard pattern to regex
 * @param {string} pattern - Pattern with * and ? wildcards
 * @returns {RegExp}
 */
function wildcardToRegex(pattern) {
  // Escape regex special chars except * and ?
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  // Convert wildcards to regex
  const regexPattern = escaped
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  
  return new RegExp(`^${regexPattern}$`, 'i');
}

/**
 * Check if a value matches a wildcard pattern
 * @param {*} fieldValue - The value from the instance field
 * @param {string} pattern - Wildcard pattern (supports * and ?)
 * @returns {boolean}
 */
export function wildcardMatch(fieldValue, pattern) {
  if (fieldValue === null || fieldValue === undefined) {
    return false;
  }

  const regex = wildcardToRegex(pattern);
  return regex.test(String(fieldValue));
}

/**
 * Coerce values for comparison based on type hints
 * @param {*} fieldValue - The value from the instance field
 * @param {string} queryValue - The value from the query
 * @returns {boolean}
 */
export function coerceAndCompare(fieldValue, queryValue) {
  if (fieldValue === null || fieldValue === undefined) {
    return false;
  }

  // Boolean comparison
  if (typeof fieldValue === 'boolean') {
    const queryBool = queryValue.toLowerCase();
    if (queryBool === 'true') return fieldValue === true;
    if (queryBool === 'false') return fieldValue === false;
  }

  // Date comparison (basic ISO 8601)
  if (fieldValue instanceof Date || isISODateString(fieldValue)) {
    const fieldDate = fieldValue instanceof Date ? fieldValue : new Date(fieldValue);
    const queryDate = new Date(queryValue);
    if (!isNaN(queryDate.getTime()) && !isNaN(fieldDate.getTime())) {
      return fieldDate.getTime() === queryDate.getTime();
    }
  }

  // Fall back to string comparison
  return String(fieldValue).toLowerCase() === queryValue.toLowerCase();
}

/**
 * Check if a string looks like an ISO 8601 date
 * @param {*} value
 * @returns {boolean}
 */
function isISODateString(value) {
  if (typeof value !== 'string') return false;
  return /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/.test(value);
}

/**
 * Match a value against a pattern (auto-detects match type)
 * @param {*} fieldValue - The value from the instance field
 * @param {string} queryValue - The value/pattern from the query
 * @param {'exact' | 'wildcard'} matchType - Type of matching to perform
 * @returns {boolean}
 */
export function matchValue(fieldValue, queryValue, matchType) {
  if (matchType === 'wildcard') {
    return wildcardMatch(fieldValue, queryValue);
  }
  return coerceAndCompare(fieldValue, queryValue);
}

/**
 * Check if any field in an object contains the search value
 * @param {Object} instance - The instance to search
 * @param {string} queryValue - The value to search for
 * @param {'exact' | 'wildcard'} matchType - Type of matching
 * @returns {boolean}
 */
export function matchAnyField(instance, queryValue, matchType) {
  for (const [key, value] of Object.entries(instance)) {
    if (key.startsWith('_') && key !== '_class' && key !== '_id') {
      // Skip internal fields except _class and _id
      continue;
    }
    if (matchValue(value, queryValue, matchType)) {
      return true;
    }
  }
  return false;
}
