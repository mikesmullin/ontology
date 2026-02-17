# Ontology

An ontology is a structured way to describe things in a domain and how they relate to each other.
Think of it like a schema + a dictionary + relationship rules, all combined.
If a database schema describes data storage, then an ontology describes concepts and the meaning between them.

This file will teach you a skill: how to lookup employees and add them to our ontology flat-file database.
If I say `ETL <employee>` (ie. `ETL jdoe`) then that means to perform this skill (extract LDAP employee record -> ontology resource yaml flat-file db) on the employee (ie. `jdoe`).

### Schema

We utilize a proprietary schema, inspired by Kubernetes (YAML) resource files.
Properties are defined within reusable **components**, which are then attached to **classes**.
An example follows:

```yml
# ~/.ontology/storage/org-stormy.yml
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
---
# ~/.ontology/storage/product-scr.yml
apiVersion: agent/v1
kind: Ontology
metadata:
  namespace: stormy
spec:
  classes:
  - _class: Product
    _id: tetris
    components:
      naming:
        name: "Tetris"
```

### Gathering Data

You will occasionally be asked to fetch an employee record via LDAP.
ie. lookup employee `jdoe`:
```bash
$ node ./actions/lookup-employee.mjs --name jdoe
```

The goal is to convert it to an ontology resource file.

example: given this output from `lookup-employee.mjs`:
```bash
$ node ./actions/lookup-employee.mjs --name jdoe
Authenticating with Microsoft Graph...
Token valid for 1337 more minutes
Using cached token from .tokens.yaml
Looking up employee: jdoe
Trying with @company.com domain...
Could not fetch sign-in activity: User is not in the allowed roles
name: John Doe
email: jdoe@company.com
title: Software Engineer
department: Information Technology
active: true
activeConfidence: medium
activeSignals:
  - No sign-in activity recorded
accountType: user
manager: msmullin@company.com
searchMethod: username with domain
accountEnabled: true
createdDateTime: "2015-06-12T23:46:05Z"
onPremisesSyncEnabled: true
userType: Member
employeeType: Employee
isResourceAccount: false
givenName: John
surname: Doe
assignedPlansCount: 116
managerName: Mike Smullin
managerTitle: Lead Site Reliability Engineer
directReportsCount: 0
directReports: []
lastSignIn: null
userPrincipalName: jdoe@company.com
```

then we expect to generate output 
under `~/.ontology/storage/*.yml`
like:
```yml
# ~/.ontology/storage/person-jdoe.yml
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

Relations are defined within the class instance using a compact format:
- The `_from` is implicit (it's the `_id` of the containing class)
- Each relation type maps to an array of targets
- For relations with qualifiers, use `{ _to: target, qualifier: value }`

ie. link the team
```yml
# ~/.ontology/storage/team-zulu.yml
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

ie. link the manager

if the manager exists, we add the relation within `~/.ontology/storage/person-jdoe.yml`:
```yml
  # within the class instance...
    relations:
      MEMBER_OF:
      - team-zulu
      REPORTS_TO:
      - msmullin
```
else, we (recurse to) lookup the manager, and create his file `~/.ontology/storage/person-msmullin.yml`

### Using the Ontology CLI

The `ontology` CLI tool provides commands to manage both schema (T-box) and instances (A-box).

Run `ontology --help` for the full command list. Key commands:

#### T-box (Schema) Commands
```bash
ontology decl cls :ClassName                        # Declare a new class
ontology decl comp ComponentName key:type [required] # Declare a new component with properties
ontology decl cmp :Class local:Component [...]       # Attach components to a class
ontology decl rel :Domain mtm :REL_NAME :Range       # Declare a relation
ontology decl prop Component key:type [required]     # Add properties to existing component
ontology decl qual :REL_NAME key:type [required]     # Add qualifiers to a relation
```

#### A-box (Instance) Commands
```bash
ontology new id:Class comp.key=value [...]    # Create instance with inline properties
ontology set id:Class comp.key=value          # Set properties on existing instance
ontology link from:Class REL_NAME to:Class    # Create a relation between instances
ontology get id                               # Get instance with its relations
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
- The `new` command supports inline property setting: `ontology new myid:Class naming.name="My Name"` — this avoids validation failures from missing required fields.
- The `decl cmp` command attaches existing components to a class: e.g., `ontology decl cmp :Service naming:Naming documentation:Documentation`
- All schema/instance-mutating commands validate after write and roll back on failure.

IMPORTANT: Whenever you make changes to the `~/.ontology/storage/*.yml`, run `ontology validate` to confirm the changes are correct.