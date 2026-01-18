# Ontology YAML Specification RFC

**Version:** 1.1  
**Status:** Draft  
**Date:** January 18, 2026

---

## Abstract

This document describes a proprietary YAML-based ontology specification for representing domain concepts, their properties, and relationships. The specification is inspired by Kubernetes resource files and provides a declarative way to define and manage structured knowledge as flat-file databases.

---

## 1. Introduction

### 1.1 What is an Ontology?

An ontology is a structured way to describe things in a domain and how they relate to each other. It combines:

- **Schema**: Structure and validation rules for data
- **Dictionary**: Definitions of concepts and terminology
- **Relationship Rules**: How concepts connect to one another

While a database schema describes data storage, an ontology describes **concepts and the meaning between them**.

### 1.2 Purpose

This specification enables:

- Declarative definition of domain classes and their properties
- Explicit relationship modeling between entities
- Flat-file storage in YAML format for version control and portability
- Human-readable knowledge representation

---

## 2. Document Structure

### 2.1 Resource Header

Every ontology document follows the Kubernetes-style resource format:

```yaml
apiVersion: agent/v1
kind: Ontology
metadata:
  namespace: <namespace>
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `apiVersion` | string | Yes | API version identifier. Currently `agent/v1` |
| `kind` | string | Yes | Resource type. Must be `Ontology` |
| `metadata.namespace` | string | Yes | Logical grouping for resources |

### 2.2 Document Sections

An ontology document can contain two main sections:

1. **`schema`**: Defines classes and relation types (the "T-box")
2. **`spec`**: Contains actual instances of classes and relations (the "A-box")

Documents can be separated using YAML's multi-document syntax (`---`).

---

## 3. Schema Definition

The schema section defines the structure of the ontology.

### 3.1 Classes

Classes represent types of entities in the domain.

```yaml
schema:
  classes:
    ClassName:
      properties:
        propertyName: { type: <type>, required: <bool> }
```

#### Property Types

| Type | Description |
|------|-------------|
| `string` | Text value |
| `bool` | Boolean (true/false) |
| `date` | ISO 8601 date/datetime |
| `string[]` | Array of text values |
| `bool[]` | Array of booleans |
| `date[]` | Array of dates |

#### Example

```yaml
schema:
  classes:
    Person:
      properties:
        givenName: { type: string, required: true }
        surname: { type: string, required: true }
        name: { type: string, required: true }
        email: { type: string, required: true }
        title: { type: string, required: true }
        active: { type: bool, required: true }
        created: { type: date, required: true }
    Team: {}
    Product: {}
```

> **Note:** Classes with no properties (e.g., `Team: {}`) are valid and serve as entity type markers.

#### Hybrid Schema Model

This ontology uses a **hybrid schema/schemaless** approach, similar to document databases:

| Property Definition | Behavior |
|---------------------|----------|
| Defined in schema (T-box) | Validated against type and required constraints |
| NOT defined in schema | Accepted without validation (schemaless) |

**Key principles:**

1. **Schema properties are validated** — If a property is defined in the class schema, instances must conform to those rules.

2. **Undefined properties are passthrough** — Any property on an instance (A-box) that is NOT defined in the class schema (T-box) is still valid and stored; it simply bypasses validation.

3. **Schema is opt-in validation** — Defining properties in the schema is a way to enforce constraints, not to restrict the data model.

**Example:**

```yaml
# Schema (T-box) - only 'name' is validated
schema:
  classes:
    Person:
      properties:
        name: { type: string, required: true }

---
# Instance (A-box) - 'nickname' is not in schema but still valid
spec:
  classes:
  - _class: Person
    _id: jdoe
    name: "John Doe"           # ✓ Validated (required string)
    nickname: "Johnny"         # ✓ Accepted (no validation, schemaless)
    favoriteColor: "blue"      # ✓ Accepted (no validation, schemaless)
```

This design allows:
- Gradual schema evolution without breaking existing data
- Flexibility for ad-hoc properties during exploration
- Strict validation only where explicitly needed

### 3.2 Relations

Relations define how classes connect to each other.

```yaml
schema:
  relations:
    RELATION_NAME:
      domain: <SourceClass>
      range: <TargetClass>
      cardinality: <oto|otm|mto|mtm>
      qualifiers:
        qualifierName:
          type: <type>
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `domain` | string | Yes | Source class (the "from" side) |
| `range` | string | Yes | Target class (the "to" side) |
| `cardinality` | string | Yes | Cardinality code (see below) |
| `qualifiers` | object | No | Additional attributes on the relation |

#### Cardinality Codes

| Code | Pattern | Meaning |
|------|---------|--------|
| `oto` | 1..1 | one-to-one (required, exactly one) |
| `otm` | 1..* | one-to-many (required, unbounded) |
| `mto` | *..1 | many-to-one (optional, at most one) |
| `mtm` | *..* | many-to-many (optional, unbounded) |

> **Note:** Cardinality validation only enforces the maximum constraint. Minimum constraints are advisory.

#### Naming Conventions

| Element | Convention | Example |
|---------|------------|--------|
| Classes | ProperCase | `Person`, `TeamMember` |
| Relations | UPPERCASE_UNDERSCORED | `MEMBER_OF`, `REPORTS_TO` |
| Properties | camelCase | `givenName`, `emailAddress` |
| Qualifiers | camelCase | `since`, `role` |

#### Example

```yaml
schema:
  relations:
    MEMBER_OF:
      domain: Person
      range: Team
      cardinality: mtm
    
    REPORTS_TO:
      domain: Person
      range: Person
      cardinality: oto
    
    OWNS:
      domain: Team
      range: Product
      cardinality: mtm
      qualifiers:
        role:
          type: string
```

---

## 4. Instance Specification (spec)

The `spec` section contains actual data instances.

### 4.1 Class Instances

```yaml
spec:
  classes:
  - _class: <ClassName>
    _id: <unique-identifier>
    propertyName: value
    relations:
      RELATION_NAME:
      - target_id
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `_class` | string | Yes | Reference to a defined class |
| `_id` | string | Yes | Unique identifier for this instance |
| `<property>` | varies | Per schema | Property values as defined in schema |
| `relations` | object | No | Per-class relations (see 4.2) |

#### Example

```yaml
spec:
  classes:
  - _class: Person
    _id: jdoe
    givenName: "John"
    surname: "Doe"
    name: "John Doe"
    email: "jdoe@company.com"
    title: "Software Engineer"
    active: true
    created: "2015-06-12T23:46:05Z"
    relations:
      MEMBER_OF:
      - team-zulu
      REPORTS_TO:
      - msmullin
```

### 4.2 Relation Instances (Per-Class Format)

Relations are defined within each class instance using a compact object format:

```yaml
spec:
  classes:
  - _class: <ClassName>
    _id: <source_id>
    relations:
      <RELATION_NAME>:
      - <target_id>
      - { _to: <target_id>, qualifierName: value }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `relations` | object | No | Map of relation types to target lists |
| `<RELATION_NAME>` | array | - | List of targets for this relation type |
| `<target_id>` | string | - | Simple target reference (ID only) |
| `{ _to, ... }` | object | - | Target with qualifiers |

#### Example

```yaml
spec:
  classes:
  - _class: Person
    _id: jdoe
    givenName: "John"
    surname: "Doe"
    relations:
      MEMBER_OF:
      - team-zulu
      REPORTS_TO:
      - msmullin

  - _class: Team
    _id: team-zulu
    relations:
      OWNS:
      - { _to: tetris, role: "product-owner" }
```

> **Note:** The `_from` is implicitly the `_id` of the containing class instance.

---

## 5. File Organization

### 5.1 Naming Convention

Files should be stored in the `storage/` directory with descriptive names:

```
storage/<class>-<id>.yml
```

Examples:
- `storage/org-stormy.yml` — Schema definition
- `storage/person-jdoe.yml` — Person instance
- `storage/team-zulu.yml` — Team instance
- `storage/product-scr.yml` — Product instance

### 5.2 Document Separation

Multiple logical documents can exist in one file using YAML's `---` separator:

```yaml
# Schema document
apiVersion: agent/v1
kind: Ontology
metadata:
  namespace: stormy
schema:
  classes:
    Person: {}
---
# Instance document
apiVersion: agent/v1
kind: Ontology
metadata:
  namespace: stormy
spec:
  classes:
  - _class: Person
    _id: example
```

### 5.3 Relation Placement

Relations are defined per-class within the `relations` property of each class instance:

- Relations are always co-located with their source (`_from`) entity
- The `_from` is implicit — it is the `_id` of the containing class instance
- This ensures clear ownership and simplifies validation

---

## 6. Complete Example

### Schema Definition (`storage/org-stormy.yml`)

```yaml
apiVersion: agent/v1
kind: Ontology
metadata:
  namespace: stormy
schema:
  classes:
    Person:
      properties:
        givenName: { type: string, required: true }
        surname: { type: string, required: true }
        name: { type: string, required: true }
        email: { type: string, required: true }
        title: { type: string, required: true }
        active: { type: bool, required: true }
        created: { type: date, required: true }
    Team: {}
    Product: {}
  relations:
    MEMBER_OF:
      domain: Person
      range: Team
      cardinality: mtm
    REPORTS_TO:
      domain: Person
      range: Person
      cardinality: oto
    OWNS:
      domain: Team
      range: Product
      cardinality: mtm
      qualifiers:
        role:
          type: string
```

### Person Instance (`storage/person-jdoe.yml`)

```yaml
apiVersion: agent/v1
kind: Ontology
metadata:
  namespace: stormy
spec:
  classes:
  - _class: Person
    _id: jdoe
    givenName: "John"
    surname: "Doe"
    name: "John Doe"
    email: "jdoe@company.com"
    title: "Software Engineer"
    active: true
    created: "2015-06-12T23:46:05Z"
    relations:
      MEMBER_OF:
      - team-zulu
      REPORTS_TO:
      - msmullin
```

### Team Instance (`storage/team-zulu.yml`)

```yaml
apiVersion: agent/v1
kind: Ontology
metadata:
  namespace: stormy
spec:
  classes:
  - _class: Team
    _id: team-zulu
    relations:
      OWNS:
      - { _to: tetris, role: "product-owner" }
```

---

## 7. Processing Rules

### 7.1 Instance Resolution

When creating new instances:

1. Check for existing instances by `_id` across all files in `storage/`
2. If found, update the existing file
3. If not found, create a new file following the naming convention

### 7.2 Relation Linking

When establishing relations:

1. Verify both `_from` and `_to` instances exist
2. If target instance doesn't exist, create it first (recursively if needed)
3. Append the relation to the appropriate file

### 7.3 Validation

Implementations should validate:

- Required properties are present
- Property types match schema definitions
- Relation domains and ranges are respected
- Cardinality constraints are satisfied

---

## 8. Design Rationale

| Decision | Rationale |
|----------|-----------|
| Kubernetes-style headers | Familiar format, extensibility, tooling compatibility |
| YAML format | Human-readable, version control friendly, widely supported |
| Flat-file storage | Simplicity, no database dependencies, easy backup/sync |
| Separate schema/spec | Clear separation of structure and data |
| Namespaces | Multi-tenancy, logical organization |
| Explicit cardinality | Validation support, documentation of constraints |
| Qualifiers on relations | Rich relationship metadata without schema bloat |

---

## 9. Future Considerations

- **Inheritance**: Class hierarchy support (`extends` keyword)
- **Computed properties**: Derived values from relations
- **Validation tooling**: CLI for schema validation
- **Query language**: GraphQL-like querying across the ontology
- **Change tracking**: Built-in versioning and audit trail

---

## Appendix A: Reserved Fields

The following field prefixes are reserved for system use:

| Prefix | Purpose |
|--------|---------|
| `_class` | Class type identifier |
| `_id` | Instance identifier |
| `_from` | Relation source |
| `_to` | Relation target |
| `_relation` | Relation type || `_namespace` | Namespace identifier (internal) |
| `_source` | Source file path (internal) |
---

## Appendix B: Grammar Summary

```
Document     := Header (Schema | Spec)
Header       := apiVersion kind metadata
Schema       := schema { classes, relations }
Spec         := spec { classes[] }
Class        := ClassName { properties }
Property     := name { type, required }
Relation     := name { domain, range, cardinality, qualifiers? }
Cardinality  := "oto" | "otm" | "mto" | "mtm"
ClassInst    := _class, _id, ...properties, relations?
RelationsMap := { RELATION_NAME: [target | { _to, ...qualifiers }] }
```
