/**
 * Validate Command Handler
 */

import { loadAll } from '../../core/loader.js';
import { validate } from '../../core/validator.js';

/**
 * Format validation errors/warnings for display
 * @param {import('../../core/validator.js').ValidationError[]} items
 * @param {string} label
 * @returns {string}
 */
function formatIssues(items, label) {
  if (items.length === 0) return '';

  const lines = [`${label}: ${items.length}`, ''];
  
  // Group by source file
  const bySource = new Map();
  for (const item of items) {
    const source = item.source || 'unknown';
    if (!bySource.has(source)) {
      bySource.set(source, []);
    }
    bySource.get(source).push(item);
  }

  for (const [source, issues] of bySource) {
    lines.push(`  ${source}`);
    for (const issue of issues) {
      const prefix = issue.severity === 'error' ? '✗' : '⚠️';
      lines.push(`    ${prefix}\t${issue.instance}: ${issue.message}`);
    }
  }

  return lines.join('\n');
}

/**
 * Show validate command help
 */
function showHelp() {
  console.log(`
ontology validate - Validate instances against schema

Usage:
  ontology validate [options]

Options:
  --quiet, -q      Only output if there are errors
  --strict         Treat warnings as errors
  --help           Show this help message

Description:
  Validates all ontology files in ~/.ontology/storage/**/*.{yml,yaml,md} against the schema (T-box).

  Component-Based Validation:
  - Properties must be defined within components (no root-level properties)
  - Components must be declared in schema.components with their properties
  - Classes reference components via schema.classes[].components mapping
  - Instance values are grouped under spec.classes[].components.<localName>

  Checks performed:
  - apiVersion: agent/v1 is present (exact-match, required)
  - kind: Ontology is present (exact-match, required)
  - schema: or spec: is defined in each file
  - Each file contains at most one class instance
  - _id is globally unique across all files
  - _class reference is defined in schema
  - Component local names match class schema definition
  - Required component properties are present
  - Property types match component schema (string, bool, date, ref)
  - ref/ref[] values must use <_id>:<Class> format and reference existing instances
  - No undefined properties (strict - no schemaless)
  - Relation endpoints exist
  - Relation domain/range constraints
  - Implicit LINKS_TO relations extracted from [[Class/id]] wiki links
  - Cardinality constraints

Examples:
  ontology validate
  ontology validate --strict
  ontology validate --quiet
`);
}

/**
 * Handle the validate command
 * @param {string[]} args
 */
export async function handleValidate(args) {
  // Check for help flag
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }

  const quiet = args.includes('--quiet') || args.includes('-q');
  const strict = args.includes('--strict');

  // Load all data
  const data = await loadAll();

  // Run validation
  const result = validate(data);

  // In strict mode, warnings count as errors
  const hasErrors = result.errors.length > 0 || (strict && result.warnings.length > 0);

  // Output results
  if (!quiet || hasErrors) {
    console.log(`Validating ${result.counts.classes} class instances and ${result.counts.relations} relations...`);
    console.log('');
  }

  if (result.errors.length > 0) {
    console.log(formatIssues(result.errors, 'Errors'));
    console.log('');
  }

  if (result.warnings.length > 0 && (!quiet || strict)) {
    console.log(formatIssues(result.warnings, 'Warnings'));
    console.log('');
  }

  if (hasErrors) {
    console.log('Validation failed.');
    process.exit(1);
  } else if (!quiet) {
    if (result.warnings.length > 0) {
      console.log(`Validation passed with ${result.warnings.length} warning(s).`);
    } else {
      console.log('Validation passed.');
    }
  }
}
