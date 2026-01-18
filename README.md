# Ontology

A CLI validation tool for the Ontology YAML specification.

## Installation

```bash
# Install dependencies
bun install

# Make the CLI executable
chmod +x bin/ontology.js

# Link globally (optional)
bun link
```

## Usage

### Search Command

Search instances in `storage/*.yml` using a Lucene-like DSL.

```bash
# Find all Person instances
bun run bin/ontology.js search "_class:Person"

# Find by exact field value
bun run bin/ontology.js search "email:\"jdoe@company.com\""

# Wildcard search
bun run bin/ontology.js search "name:John*"

# Combined queries
bun run bin/ontology.js search "_class:Person AND active:true"

# Search relations
bun run bin/ontology.js search "_relation:memberOf"
```

#### Search Options

| Option | Description |
|--------|-------------|
| `-v, --verbose` | Show full YAML output |
| `--ids` | Show only instance IDs |
| `-c, --count` | Show only match count |

### Schema Commands

```bash
# List all classes and relations
bun run bin/ontology.js schema list

# Get details for a class
bun run bin/ontology.js schema get Person

# Get details for a relation
bun run bin/ontology.js schema get memberOf
```

### Get Command

Retrieve a single instance by its `_id` and display its spec with relationships.

```bash
# Get an instance by ID
bun run bin/ontology.js get jdoe

# Example output:
# _class: Person
# _id: jdoe
# givenName: John
# surname: Doe
# ...
# 
# Relations:
#   memberOf -> team-zulu
#   reportsTo -> msmullin
```

### Graph Command

Visualize the relationship graph starting from an instance.

```bash
# Show relationships for an instance (default depth: 1)
bun run bin/ontology.js graph jdoe

# Traverse deeper (depth 2)
bun run bin/ontology.js graph -d 2 team-zulu

# Example output:
# _id       | relation  | parent   
# ----------|-----------|----------
# jdoe      | memberOf  | team-zulu
# jdoe      | reportsTo | msmullin 
```

#### Graph Options

| Option | Description |
|--------|-------------|
| `-d, --depth <n>` | Maximum traversal depth (default: 1) |
| `-f, --format <fmt>` | Output format: table (default: table) |

### Validate Command

Validate all instances against the schema.

```bash
# Run validation
bun run bin/ontology.js validate

# Quiet mode (only output on errors)
bun run bin/ontology.js validate --quiet

# Strict mode (treat warnings as errors)
bun run bin/ontology.js validate --strict
```

#### Validation Checks

- `apiVersion: agent/v1` is present
- `kind: Ontology` is present
- `schema:` or `spec:` is defined in each file
- `_id` is unique within namespace
- `_class` reference exists in schema
- Required properties are present
- Property types match schema (including array types like `string[]`)
- Relation endpoints exist
- Relations defined in same file as `_from` instance
- Domain/range constraints
- Cardinality constraints

## Query DSL Syntax

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
