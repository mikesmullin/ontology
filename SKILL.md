# Ontology

An ontology is a structured way to describe things in a domain and how they relate to each other.
Think of it like a schema + a dictionary + relationship rules, all combined.
If a database schema describes data storage, then an ontology describes concepts and the meaning between them.

It combines:
- **Schema**: structure and validation rules for data
- **Dictionary**: definitions of concepts and terminology
- **Relationship Rules**: how concepts connect to one another

### Core Model

#### T-Box vs A-Box

| Box | Section | Purpose |
|---|---|---|
| T-Box | `schema` | Defines component types, class types, and relation types |
| A-Box | `spec` | Contains concrete class instances and per-instance relations |

> One ontology document may contain `schema`, `spec`, or both. A file must contain at least one of them.

#### Supported Property Types

| Type | Meaning |
|---|---|
| `string` | Text |
| `bool` | Boolean |
| `date` | ISO-8601 date/datetime string |
| `string[]` | Array of text |
| `bool[]` | Array of booleans |
| `date[]` | Array of ISO-8601 date/datetime strings |

#### Qualifier Structure (relations)

| Location | Shape |
|---|---|
| Relation type definition | `schema.relations.REL.qualifiers.<name>.type` |
| Relation instance value | `relations.REL: [targetId, { _to: targetId, qualifier: value }]` |

```yaml
schema:
  relations:
    OWNS:
      domain: Team
      range: Product
      cardinality: mtm
      qualifiers:
        role:
          type: string

spec:
  classes:
  - _class: Team
    _id: team-zulu
    relations:
      OWNS:
      - { _to: tetris, role: product-owner }
```

#### Naming Conventions

| Element | Convention | Example |
|---|---|---|
| Class type names | ProperCase | `Person`, `TeamMember` |
| Component type names | ProperCase | `Identity`, `Contact` |
| Relation type names | UPPERCASE_UNDERSCORED | `MEMBER_OF`, `REPORTS_TO` |
| Property names | camelCase | `givenName`, `emailAddress` |
| Qualifier names | camelCase | `role`, `createdAt` |
| Class component local names | camelCase | `identity`, `contact` |

#### Grammar + Terminologys

```text
Document       := Header (Schema? Spec?)
Header         := apiVersion kind metadata
Schema         := schema { components?, classes?, relations? }
Spec           := spec { classes[] }

ComponentType  := ComponentName { properties }
Property       := name { type, required }
ClassType      := ClassName { components? }
ClassComp      := localName: ComponentType
Relationship   := name { domain, range, cardinality, qualifiers? }
Cardinality    := "oto" | "otm" | "mto" | "mtm"

ClassInstance  := _class, _id, components?, relations?
Component      := localName: { ...propertyValues }
RelationsMap   := { RELATION_NAME: [targetId | { _to, ...qualifiers }] }
Qualifier      := scalar value on a qualified relation target object
```

Implementation notes:
- `spec.relations` (top-level) is invalid; relations must be nested under each class instance.
- Relation targets must be either string IDs or objects containing `_to`.
- Each file may contain at most one class instance (`spec.classes` total per file).

### Schema + Data Quick Reference

Use this compact pattern when creating or updating ontology files.

#### 1) Schema (Pattern)

| Section | Required fields | Notes |
|---|---|---|
| Header | `apiVersion`, `kind`, `metadata.namespace` | Must be `agent/v1` + `Ontology` |
| Components | `schema.components.<Component>.properties` | Property types: `string`, `bool`, `date`, and array variants |
| Classes | `schema.classes.<Class>.components` | Maps local component names to component classes |
| Relations | `schema.relations.<REL>` with `domain`, `range`, `cardinality` | Cardinality: `oto`, `otm`, `mto`, `mtm` |

```yaml
# ~/.ontology/storage/org-stormy.md
---
apiVersion: agent/v1
kind: Ontology
metadata:
  namespace: stormy
schema:
  components:
    Identity:
      properties:
        givenName: { type: string, required: true }
        surname: { type: string, required: true }
        name: { type: string, required: true }
    Contact:
      properties:
        email: { type: string, required: true }
    Naming:
      properties:
        name: { type: string, required: true }
  classes:
    Person:
      components:
        identity: Identity
        contact: Contact
    Team:
      components:
        naming: Naming
  relations:
    MEMBER_OF:
      domain: Person
      range: Team
      cardinality: mtm
---
```

#### 2) Data (Example)

| Instance field | Purpose | Example |
|---|---|---|
| `_class` | Class identifier | `Person`, `Team` |
| `_id` | Unique instance ID | `jdoe`, `team-zulu` |
| `components` | Values grouped by class local component names | `identity`, `contact`, `naming` |
| `relations` | Outgoing links from this instance | `MEMBER_OF: [team-zulu]` |

```yaml
# ~/.ontology/storage/person-jdoe.md
---
apiVersion: agent/v1
kind: Ontology
metadata:
  namespace: stormy
spec:
  classes:
  - _class: Person
    _id: jdoe
    components:
      identity:
        givenName: John
        surname: Doe
        name: John Doe
      contact:
        email: jdoe@company.com
    relations:
      MEMBER_OF:
      - team-zulu
---

# ~/.ontology/storage/team-zulu.md
---
apiVersion: agent/v1
kind: Ontology
metadata:
  namespace: stormy
spec:
  classes:
  - _class: Team
    _id: team-zulu
    components:
      naming:
        name: Team Zulu
---
```

### Using the Ontology CLI

The `ontology` CLI is now import-first.

Run `ontology --help` for the full command list. Primary command:

```bash
ontology import file.yaml [--force]
ontology --db /tmp/my-ontology import file.yaml
```

Supported instance/query utilities:

```bash
ontology set id:Class comp.key=value          # Set properties on existing instance
ontology link from:Class REL_NAME to:Class    # Create a relation between instances
ontology get id                               # Get instance with its relations
ontology rm id [id ...]                       # Remove instances
ontology validate                             # Validate all data
ontology search "query"                       # Search instances
ontology graph id                             # Visualize relationships
ontology schema list                          # List classes/components/relations
```

#### Import from YAML (Recommended for Complex Data)

The `import` command is the **preferred way to create or update instances**, especially when dealing with:
- Multiline strings (descriptions, bodies)
- Complex nested data
- Batch operations

```bash
ontology import task.yaml              # Import single instance
ontology import batch.yaml --verbose   # Import with detailed output
ontology import update.yaml --force    # Overwrite existing instances
```

**Input format (single document):**

```yaml
_class: Task
_id: abc123                    # Optional: auto-generated if omitted
components:
  workunit:
    id: abc123
    summary: My task
    description: |
      Multiline description
      with paragraphs.
    important: true
    urgent: false
```

**Batch format (multi-document):**

```yaml
---
_class: Person
_id: jdoe
components:
  identity:
    name: John Doe
    givenName: John
    surname: Doe
---
_class: Person
_id: asmith
components:
  identity:
    name: Alice Smith
```

**With markdown body:**

```yaml
_class: Task
_id: abc123
_body: |
  # Task Title
  Extended description stored as markdown body
components:
  workunit:
    summary: Task Title
```

#### Query Commands
```bash
ontology search "query"       # Search instances
ontology graph -d 2 id        # Visualize relationship graph
ontology schema list           # List all classes, components, and relations
ontology schema get Name       # Print schema for a class, component, or relation
ontology validate              # Validate all instances against schema
```

#### Tips
- **Use `import` for almost all writes**: File-based mutations via `ontology import` are preferred over CLI args, especially for multiline strings or batch operations.
- Use `--db <dir>` when you want to test safely in an isolated location (the CLI reads/writes `<dir>/storage`). This is rare and mostly only useful in smoke testing.
- All mutating commands validate after write and roll back on failure.

IMPORTANT: Whenever you make changes to the ontology data, run `ontology validate` to confirm the changes are correct.