# Ontology

An ontology is a structured way to describe things in a domain and how they relate to each other.
Think of it like a schema + a dictionary + relationship rules, all combined.
If a database schema describes data storage, then an ontology describes concepts and the meaning between them.

This file will teach you a skill: how to lookup employees and add them to our ontology flat-file database.
If I say `ETL <employee>` (ie. `ETL jdoe`) then that means to perform this skill (extract LDAP employee record -> ontology resource yaml flat-file db) on the employee (ie. `jdoe`).

### Schema

We utilize a proprietary schema, inspired by Kubernetes (YAML) resource files.
An example follows:

```yml
# storage/org-stormy.yml
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
      range:  Team
      cardinality:
        min: 0
        max: many
    reportsTo:
      domain: Person
      range:  Person
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
---
# storage/product-scr.yml
apiVersion: agent/v1
kind: Ontology
metadata:
  namespace: stormy
spec:
  classes:
  - _class: Product
    _id: tetris
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
under `storage/*.yml`
like:
```yml
# storage/person-jdoe.yml
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
```

followed by a check for existing relationship instances;
  if found, then we use those existing instance `_id`
    and update the existing definition file
      by appending our new relation
  else, we define a new instance and proceed to use its `_id`
    to define the corresponding relations

ie. link the team
```yml
# storage/team-zulu.yml
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
  # ...
  - _from: jdoe
    _relation: memberOf
    _to: team-zulu
```

ie. link the manager

if the manager exists, we simply refer to him from `storage/person-jdoe.yml`
```yml
  # ...
  relations:
  # ...
  - _from: jdoe
    _relation: reportsTo
    _to: msmullin
```
else, we (recurse to) lookup the manager, and create his file `storage/person-msmullin.yml`

### Using the Ontology CLI

The `ontology` CLI tool provides commands to search and inspect the ontology data.

- read `README.md` (or run the `ontology` tool, to see help) to understand how to use this tool for:
  - validation/linting Ontology YAML files
  - searching Ontology YAML database
  - etc.


IMPORTANT: Whenever you make changes to the `storage/*.yml`, run `ontology validate` to confirm the changes are correct.