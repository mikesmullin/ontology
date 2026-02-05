# Ontology YAML Specification RFC

**Version:** 2.0  
**Status:** Draft  
**Date:** February 5, 2026

---

## Abstract

This document describes a proprietary YAML-based ontology specification for representing domain concepts, their properties, and relationships. The specification is inspired by Kubernetes resource files and provides a declarative way to define and manage structured knowledge as flat-file databases.

**Version 2.0 introduces a component-based architecture** where properties are defined within reusable components, rather than directly on classes. This enables better composition, reuse, and stricter validation.

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

1. **`schema`**: Defines components, classes, and relation types (the "T-box")
2. **`spec`**: Contains actual instances of classes and relations (the "A-box")

Documents can be separated using YAML's multi-document syntax (`---`).

---

## 3. Schema Definition

The schema section defines the structure of the ontology.

### 3.1 Components

Components are reusable groups of properties that can be composed into classes.

```yaml
schema:
  components:
    ComponentName:
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
  components:
    Identity:
      properties:
        givenName: { type: string, required: true }
        surname: { type: string, required: true }
        name: { type: string, required: true }
    Contact:
      properties:
        email: { type: string, required: true }
    Employment:
      properties:
        title: { type: string, required: true }
        active: { type: bool, required: true }
        created: { type: date, required: true }
```

### 3.2 Classes

Classes represent types of entities in the domain. Classes are composed of components.

```yaml
schema:
  classes:
    ClassName:
      components:
        localName: ComponentClass
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `components` | object | No | Map of localName → ComponentClass |

The `localName` is a unique identifier within the class that maps to a component class. This allows the same component type to be used multiple times with different names (e.g., `homeAddress: Address`, `workAddress: Address`).

#### Example

```yaml
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
    Employment:
      properties:
        title: { type: string, required: true }
        active: { type: bool, required: true }
        created: { type: date, required: true }
  classes:
    Person:
      components:
        identity: Identity
        contact: Contact
        employment: Employment
    Team: {}
    Product: {}
```

> **Note:** Classes with no components (e.g., `Team: {}`) are valid and serve as entity type markers.

### 3.3 Strict Property Validation

**Important:** Properties may ONLY be defined within components. There is no "schemaless" passthrough for undefined properties.

- All properties on an instance must be defined in a component
- Properties must be grouped under their component's localName
- The validator will reject any properties at the instance root level

This design ensures:
- Complete schema coverage of all data
- Consistent validation across all properties
- Clear ownership of properties through components

### 3.4 Relations

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
    components:
      <localName>:
        propertyName: value
    relations:
      RELATION_NAME:
      - target_id
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `_class` | string | Yes | Reference to a defined class |
| `_id` | string | Yes | Unique identifier for this instance |
| `components` | object | Yes* | Map of localName → property values |
| `relations` | object | No | Per-class relations (see 4.2) |

*Components are required if the class has components with required properties.

#### Example

```yaml
spec:
  classes:
  - _class: Person
    _id: jdoe
    components:
      identity:
        givenName: "John"
        surname: "Doe"
        name: "John Doe"
      contact:
        email: "jdoe@company.com"
      employment:
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
    components:
      identity:
        givenName: "John"
        surname: "Doe"
        name: "John Doe"
      contact:
        email: "jdoe@company.com"
    relations:
      MEMBER_OF:
      - team-zulu
      REPORTS_TO:
      - msmullin

  - _class: Team
    _id: team-zulu
    components:
      naming:
        name: "Team Zulu"
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
  components:
    Identity:
      properties:
        givenName: { type: string, required: true }
        surname: { type: string, required: true }
        name: { type: string, required: true }
    Contact:
      properties:
        email: { type: string, required: true }
    Employment:
      properties:
        title: { type: string, required: true }
        active: { type: bool, required: true }
        created: { type: date, required: true }
    Naming:
      properties:
        name: { type: string, required: true }
  classes:
    Person:
      components:
        identity: Identity
        contact: Contact
        employment: Employment
    Team:
      components:
        naming: Naming
    Product:
      components:
        naming: Naming
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
    components:
      identity:
        givenName: "John"
        surname: "Doe"
        name: "John Doe"
      contact:
        email: "jdoe@company.com"
      employment:
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
    components:
      naming:
        name: "Team Zulu"
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
| `_relation` | Relation type |
| `_namespace` | Namespace identifier (internal) |
| `_source` | Source file path (internal) |
| `components` | Reserved for component property values |
| `relations` | Reserved for relation definitions |
---

## Appendix B: Grammar Summary

```
Document      := Header (Schema | Spec)
Header        := apiVersion kind metadata
Schema        := schema { components?, classes, relations }
Spec          := spec { classes[] }
Component     := ComponentName { properties }
Property      := name { type, required }
Class         := ClassName { components? }
ClassComp     := localName: ComponentClass
Relation      := name { domain, range, cardinality, qualifiers? }
Cardinality   := "oto" | "otm" | "mto" | "mtm"
ClassInst     := _class, _id, components?, relations?
CompValues    := localName: { ...propertyValues }
RelationsMap  := { RELATION_NAME: [target | { _to, ...qualifiers }] }
```
