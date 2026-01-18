# Ontology YAML Specification RFC

**Version:** 1.0  
**Status:** Draft  
**Date:** January 17, 2026

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
    relationName:
      domain: <SourceClass>
      range: <TargetClass>
      cardinality:
        min: <number>
        max: <number|many>
      qualifiers:
        qualifierName:
          type: <type>
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `domain` | string | Yes | Source class (the "from" side) |
| `range` | string | Yes | Target class (the "to" side) |
| `cardinality.min` | number | Yes | Minimum required relations |
| `cardinality.max` | number\|"many" | Yes | Maximum allowed relations |
| `qualifiers` | object | No | Additional attributes on the relation |

#### Cardinality Examples

| Pattern | Meaning |
|---------|---------|
| `min: 0, max: many` | Optional, unbounded (0..∞) |
| `min: 1, max: 1` | Required, exactly one (1..1) |
| `min: 1, max: many` | Required, unbounded (1..∞) |

#### Example

```yaml
schema:
  relations:
    memberOf:
      domain: Person
      range: Team
      cardinality:
        min: 0
        max: many
    
    reportsTo:
      domain: Person
      range: Person
      cardinality:
        min: 1
        max: 1
    
    owns:
      domain: Team
      range: Product
      cardinality:
        min: 0
        max: many
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
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `_class` | string | Yes | Reference to a defined class |
| `_id` | string | Yes | Unique identifier for this instance |
| `<property>` | varies | Per schema | Property values as defined in schema |

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
```

### 4.2 Relation Instances

```yaml
spec:
  relations:
  - _from: <source_id>
    _relation: <relationName>
    _to: <target_id>
    qualifierName: value
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `_from` | string | Yes | ID of the source instance |
| `_relation` | string | Yes | Name of the relation type |
| `_to` | string | Yes | ID of the target instance |
| `<qualifier>` | varies | No | Qualifier values as defined in schema |

#### Example

```yaml
spec:
  relations:
  - _from: jdoe
    _relation: memberOf
    _to: team-zulu
  
  - _from: jdoe
    _relation: reportsTo
    _to: msmullin
  
  - _from: team-zulu
    _relation: owns
    _to: tetris
    role: "product-owner"
```

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

Relations can be defined in:

1. **The source entity's file** — Logical when the relation "belongs" to that entity
2. **The target entity's file** — When grouping by the target makes more sense
3. **A dedicated relations file** — For complex cross-cutting relationships

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
    memberOf:
      domain: Person
      range: Team
      cardinality:
        min: 0
        max: many
    reportsTo:
      domain: Person
      range: Person
      cardinality:
        min: 1
        max: 1
    owns:
      domain: Team
      range: Product
      cardinality:
        min: 0
        max: many
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
  - _from: jdoe
    _relation: reportsTo
    _to: msmullin
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
  - _from: team-zulu
    _relation: owns
    _to: tetris
    role: "product-owner"
  - _from: jdoe
    _relation: memberOf
    _to: team-zulu
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
| `_relation` | Relation type |

---

## Appendix B: Grammar Summary

```
Document     := Header (Schema | Spec)
Header       := apiVersion kind metadata
Schema       := schema { classes, relations }
Spec         := spec { classes[], relations[] }
Class        := ClassName { properties }
Property     := name { type, required }
Relation     := name { domain, range, cardinality, qualifiers? }
ClassInst    := _class, _id, ...properties
RelationInst := _from, _relation, _to, ...qualifiers
```
