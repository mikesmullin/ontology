# Ontology Validation Tool — Implementation Plan

**Version:** 1.0  
**Status:** Draft  
**Date:** January 17, 2026

---

## 1. Overview

A CLI validation tool for the Ontology YAML specification, built with **Bun** (modular ES6 async/await syntax).

### Constraints
- No file > 500 lines
- No function > 50 lines
- Modular ES6 with async/await

---

## 2. CLI Interface

### 2.1 Command Structure

```bash
ontology <command> [options]
```

### 2.2 Commands

| Command | Description |
|---------|-------------|
| `ontology search <query>` | Search instances in `storage/*.yml` using Lucene-like DSL |
| `ontology schema list` | List all classes and relations defined in schema |
| `ontology schema get <name>` | Print schema for a specific class or relation |

---

## 3. Schema Commands

### 3.1 `ontology schema list`

Print a summary of all classes and relations defined in the schema (T-box).

#### Invocation

```bash
ontology schema list [options]
```

#### Options

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |
| `-n, --namespace <ns>` | Filter by namespace |

#### Example Output (default)

```bash
ontology schema list
```
```
Namespace: stormy

Classes:
  Person
    ├── givenName: string (required)
    ├── surname: string (required)
    ├── name: string (required)
    ├── email: string (required)
    ├── title: string (required)
    ├── active: bool (required)
    └── created: date (required)
  Team
    (no properties defined)
  Product
    (no properties defined)

Relations:
  memberOf
    Person → Team [0..*]
  reportsTo
    Person → Person [1..1]
  owns
    Team → Product [0..*]
    qualifiers: role (string)
```

#### Example Output (`--json`)

```bash
ontology schema list --json
```
```json
{
  "namespace": "stormy",
  "classes": {
    "Person": {
      "properties": {
        "givenName": { "type": "string", "required": true },
        "surname": { "type": "string", "required": true },
        "name": { "type": "string", "required": true },
        "email": { "type": "string", "required": true },
        "title": { "type": "string", "required": true },
        "active": { "type": "bool", "required": true },
        "created": { "type": "date", "required": true }
      }
    },
    "Team": {},
    "Product": {}
  },
  "relations": {
    "memberOf": {
      "domain": "Person",
      "range": "Team",
      "cardinality": { "min": 0, "max": "many" }
    },
    "reportsTo": {
      "domain": "Person",
      "range": "Person",
      "cardinality": { "min": 1, "max": 1 }
    },
    "owns": {
      "domain": "Team",
      "range": "Product",
      "cardinality": { "min": 0, "max": "many" },
      "qualifiers": { "role": { "type": "string" } }
    }
  }
}
```

### 3.2 `ontology schema get <name>`

Print the schema definition for a specific class or relation.

#### Invocation

```bash
ontology schema get <name> [options]
```

#### Arguments

| Argument | Description |
|----------|-------------|
| `<name>` | Name of a class or relation (e.g., `Person`, `memberOf`) |

#### Options

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |
| `-n, --namespace <ns>` | Specify namespace (if ambiguous) |

#### Example: Get a Class

```bash
ontology schema get Person
```
```
Class: Person
Namespace: stormy

Properties:
  ├── givenName: string (required)
  ├── surname: string (required)
  ├── name: string (required)
  ├── email: string (required)
  ├── title: string (required)
  ├── active: bool (required)
  └── created: date (required)

Relations (as domain):
  ├── memberOf → Team [0..*]
  └── reportsTo → Person [1..1]

Relations (as range):
  └── reportsTo ← Person [1..1]
```

#### Example: Get a Relation

```bash
ontology schema get memberOf
```
```
Relation: memberOf
Namespace: stormy

  Person → Team [0..*]

Cardinality: 0..many (optional, unbounded)
Qualifiers: (none)
```

#### Example: Get with Qualifiers

```bash
ontology schema get owns
```
```
Relation: owns
Namespace: stormy

  Team → Product [0..*]

Cardinality: 0..many (optional, unbounded)
Qualifiers:
  └── role: string
```

#### Example: JSON Output

```bash
ontology schema get Person --json
```
```json
{
  "type": "class",
  "name": "Person",
  "namespace": "stormy",
  "properties": {
    "givenName": { "type": "string", "required": true },
    "surname": { "type": "string", "required": true },
    "name": { "type": "string", "required": true },
    "email": { "type": "string", "required": true },
    "title": { "type": "string", "required": true },
    "active": { "type": "bool", "required": true },
    "created": { "type": "date", "required": true }
  },
  "relationsAsDomain": [
    { "name": "memberOf", "range": "Team", "cardinality": { "min": 0, "max": "many" } },
    { "name": "reportsTo", "range": "Person", "cardinality": { "min": 1, "max": 1 } }
  ],
  "relationsAsRange": [
    { "name": "reportsTo", "domain": "Person", "cardinality": { "min": 1, "max": 1 } }
  ]
}
```

#### Error: Not Found

```bash
ontology schema get Foo
```
```
Error: No class or relation named 'Foo' found.
```

---

## 4. Search Command

### 4.1 Invocation

```bash
ontology search <query>
```

### 4.2 Query DSL Syntax

The query DSL is **Lucene-like**, supporting:

| Feature | Syntax | Description |
|---------|--------|-------------|
| **Exact match** | `field:"value"` | Field equals exact value |
| **Wildcard match** | `field:val*` | Field matches wildcard pattern |
| **Type match** | `_class:Person` | Match instances of a specific class |
| **Bare search** | `value` | Search across all fields |
| **AND** | `field1:a AND field2:b` | Both conditions must match |
| **OR** | `field1:a OR field2:b` | Either condition matches |
| **NOT** | `NOT field:value` | Exclude matches |
| **Grouping** | `(a OR b) AND c` | Logical grouping |

#### 4.2.1 Wildcard Patterns

| Pattern | Meaning |
|---------|---------|
| `*` | Match zero or more characters |
| `?` | Match exactly one character |

---

## 5. Query Examples

### 5.1 Type Match (find all instances of a class)

```bash
# Find all Person instances
ontology search "_class:Person"

# Find all Team instances  
ontology search "_class:Team"
```

**Output:**
```
storage/person-jdoe.yml
  Person:jdoe — John Doe <jdoe@company.com>

storage/person-msmullin.yml
  Person:msmullin — Mike Smullin <msmullin@company.com>
```

### 5.2 Exact Match (find by specific field value)

```bash
# Find person with exact email
ontology search "email:\"jdoe@company.com\""

# Find by exact ID
ontology search "_id:jdoe"

# Find inactive users
ontology search "active:false"
```

**Output:**
```
storage/person-jdoe.yml
  Person:jdoe — John Doe <jdoe@company.com>
```

### 5.3 Wildcard Match (pattern matching)

```bash
# Find all people whose name starts with "John"
ontology search "name:John*"

# Find all emails in company.com domain
ontology search "email:*@company.com"

# Find titles containing "Engineer"
ontology search "title:*Engineer*"

# Find IDs matching pattern
ontology search "_id:team-*"
```

**Output:**
```
storage/person-jdoe.yml
  Person:jdoe — John Doe (Software Engineer)

storage/person-jsmith.yml
  Person:jsmith — Jane Smith (Senior Engineer)
```

### 5.4 Combined Queries (AND/OR/NOT)

```bash
# Find active Software Engineers
ontology search "_class:Person AND title:\"Software Engineer\" AND active:true"

# Find people on team-zulu OR team-alpha (searches relations)
ontology search "_relation:memberOf AND (_to:team-zulu OR _to:team-alpha)"

# Find all people except jdoe
ontology search "_class:Person AND NOT _id:jdoe"

# Find products owned by team-zulu
ontology search "_relation:owns AND _from:team-zulu"
```

### 5.5 Bare Search (search all fields)

```bash
# Search for "John" in any field
ontology search "John"

# Search for anything containing "engineer" (case-insensitive)
ontology search "engineer"
```

### 5.6 Relation Queries

```bash
# Find all memberOf relations
ontology search "_relation:memberOf"

# Find who reports to msmullin
ontology search "_relation:reportsTo AND _to:msmullin"

# Find all relations from jdoe
ontology search "_from:jdoe"

# Find product ownership with specific role
ontology search "_relation:owns AND role:\"product-owner\""
```

---

## 6. Output Formats

### 6.1 Default (summary)

```bash
ontology search "_class:Person"
```
```
Found 3 matches:

storage/person-jdoe.yml
  Person:jdoe — John Doe <jdoe@company.com>

storage/person-msmullin.yml  
  Person:msmullin — Mike Smullin <msmullin@company.com>

storage/person-jsmith.yml
  Person:jsmith — Jane Smith <jsmith@company.com>
```

### 6.2 Verbose (`-v`, `--verbose`)

```bash
ontology search "_class:Person" --verbose
```
```yaml
# storage/person-jdoe.yml
- _class: Person
  _id: jdoe
  givenName: "John"
  surname: "Doe"
  name: "John Doe"
  email: "jdoe@company.com"
  title: "Software Engineer"
  active: true
  created: "2015-06-12T23:46:05Z"
```

### 6.3 Count only (`-c`, `--count`)

```bash
ontology search "_class:Person" --count
```
```
3
```

### 6.4 IDs only (`--ids`)

```bash
ontology search "_class:Person" --ids
```
```
jdoe
msmullin
jsmith
```

### 6.5 JSON output (`--json`)

```bash
ontology search "_class:Person" --json
```
```json
[
  { "_class": "Person", "_id": "jdoe", "name": "John Doe", ... },
  { "_class": "Person", "_id": "msmullin", "name": "Mike Smullin", ... }
]
```

---

## 7. Project Structure

```
ontology/
├── bin/
│   └── ontology.js              # CLI entry point
├── src/
│   ├── cli/
│   │   ├── index.js             # CLI router/dispatcher
│   │   └── commands/
│   │       ├── search.js        # Search command handler
│   │       └── schema.js        # Schema commands (list, etc.)
│   ├── core/
│   │   ├── loader.js            # YAML file loader
│   │   ├── index.js             # Index builder for storage/*.yml
│   │   └── types.js             # TypeScript-like JSDoc types
│   ├── query/
│   │   ├── lexer.js             # Query tokenizer
│   │   ├── parser.js            # Query AST parser
│   │   ├── evaluator.js         # AST evaluator against instances
│   │   └── matchers.js          # Wildcard/exact match helpers
│   └── output/
│       └── formatter.js         # Output formatters
├── package.json
└── README.md
```

---

## 8. Module Breakdown

### 8.1 `bin/ontology.js` — Entry Point

```js
#!/usr/bin/env bun

import { run } from '../src/cli/index.js';

await run(process.argv.slice(2));
```

### 8.2 `src/cli/index.js` — CLI Router

- Parse top-level command
- Dispatch to appropriate command handler
- Handle global flags (`--help`, `--version`)

### 8.3 `src/cli/commands/search.js` — Search Handler

- Parse search-specific flags
- Call loader to get all instances
- Parse query string into AST
- Evaluate AST against instances
- Format and output results

### 8.4 `src/cli/commands/schema.js` — Schema Commands

- Subcommand dispatcher for `schema list`, etc.
- Load schema documents from `storage/*.yml`
- Extract and aggregate class/relation definitions
- Format output (tree view or JSON)

### 8.5 `src/core/loader.js` — YAML Loader

- Glob `storage/*.yml`
- Parse multi-document YAML files
- Extract class instances and relation instances
- Return normalized data structure

### 8.6 `src/core/index.js` — Index Builder

- Build in-memory index of all instances
- Index by `_class`, `_id`, and field values
- Support efficient lookups

### 8.7 `src/query/lexer.js` — Query Tokenizer

Tokenize query string into tokens:

| Token Type | Examples |
|------------|----------|
| `FIELD` | `_class`, `name`, `email` |
| `COLON` | `:` |
| `VALUE` | `Person`, `"John Doe"`, `*Engineer*` |
| `AND` | `AND` |
| `OR` | `OR` |
| `NOT` | `NOT` |
| `LPAREN` | `(` |
| `RPAREN` | `)` |

### 8.8 `src/query/parser.js` — Query Parser

Parse tokens into AST:

```js
// Query: _class:Person AND name:John*
{
  type: 'AND',
  left: {
    type: 'MATCH',
    field: '_class',
    value: 'Person',
    matchType: 'exact'
  },
  right: {
    type: 'MATCH', 
    field: 'name',
    value: 'John*',
    matchType: 'wildcard'
  }
}
```

### 8.9 `src/query/evaluator.js` — AST Evaluator

- Traverse AST recursively
- Evaluate each node against instance
- Return boolean match result

### 8.10 `src/query/matchers.js` — Match Helpers

```js
// Exact match
exactMatch(fieldValue, queryValue) → boolean

// Wildcard match (convert * and ? to regex)
wildcardMatch(fieldValue, pattern) → boolean

// Type coercion for bool/date comparisons
coerceAndCompare(fieldValue, queryValue, fieldType) → boolean
```

### 8.11 `src/output/formatter.js` — Output Formatters

- `formatSummary(matches)` — Default human-readable
- `formatVerbose(matches)` — Full YAML
- `formatJson(matches)` — JSON array
- `formatIds(matches)` — Just IDs
- `formatCount(matches)` — Just count

---

## 9. Query Grammar (EBNF)

```ebnf
query       = expression ;

expression  = term { OR term } ;

term        = factor { AND factor } ;

factor      = NOT factor
            | LPAREN expression RPAREN
            | match
            ;

match       = [ field COLON ] value ;

field       = IDENTIFIER ;

value       = QUOTED_STRING
            | UNQUOTED_VALUE
            ;
```

### 9.1 Operator Precedence (highest to lowest)

1. `()` — Grouping
2. `NOT` — Negation
3. `AND` — Conjunction
4. `OR` — Disjunction

---

## 10. Implementation Phases

### Phase 1: Core Infrastructure
- [ ] Project setup (package.json, bun config)
- [ ] YAML loader (`src/core/loader.js`)
- [ ] Basic CLI entry point

### Phase 2: Query Engine
- [ ] Lexer (`src/query/lexer.js`)
- [ ] Parser (`src/query/parser.js`)
- [ ] Matchers (`src/query/matchers.js`)
- [ ] Evaluator (`src/query/evaluator.js`)

### Phase 3: Search Command
- [ ] Search command handler
- [ ] Output formatters
- [ ] Integration testing

### Phase 4: Schema Commands
- [ ] Schema list command (`src/cli/commands/schema.js`)
- [ ] Tree-view formatter for classes/relations
- [ ] JSON output option

### Phase 5: Polish
- [ ] Error handling and user-friendly messages
- [ ] Help text and documentation
- [ ] Edge cases and robustness

---

## 11. Dependencies

```json
{
  "name": "ontology-cli",
  "type": "module",
  "bin": {
    "ontology": "./bin/ontology.js"
  },
  "dependencies": {
    "yaml": "^2.3.0",
    "glob": "^10.0.0"
  },
  "devDependencies": {
    "bun-types": "latest"
  }
}
```

---

## 12. Error Handling

### 12.1 Query Syntax Errors

```bash
ontology search "_class:Person AND"
```
```
Error: Unexpected end of query. Expected value after AND.
  _class:Person AND
                   ^
```

### 12.2 No Matches

```bash
ontology search "_class:NonExistent"
```
```
No matches found.
```

### 12.3 Invalid Storage Directory

```bash
ontology search "_class:Person"
```
```
Error: Storage directory not found: ./storage
```

---

## 13. Future Enhancements

- [x] `ontology validate` — Validate instances against schema
- [ ] `ontology graph` — Visualize relations
- [ ] `ontology export` — Export to other formats
- [ ] Field type-aware comparisons (dates, numbers)
- [ ] Fuzzy matching (`~` operator)
- [ ] Range queries (`created:[2020-01-01 TO 2025-01-01]`)
