# Ontology

A CLI validation tool for the Ontology YAML specification.

Learn about [Ontology](https://www.geeksforgeeks.org/machine-learning/introduction-to-ontologies/).

## Motivation

This [Ontology YAML RFC](docs/ONTOLOGY_RFC.md) w/ CLI to **CRUD**, **validate**, and **search** (like neo4j Cypher)  
is a nice way for AI LLMs to validate a network of facts, by comparing their relationships;  
helpful with selective memory, recall, reasoning, and exploration of a large corpus of knowledge.

- Inventory
- People
- Teams
- Products
- Services
- Servers
- Datacenters
- Network Topologies
- Graphs
- Hierarchies
- etc.

**Example:** (simplified syntax)

```
# A-Box
Person reportsTo Person
Person leaderOf Team
Team serves Franchise
Franchise owns Product
```

LLM Query:
```
List SREs supporting Tetris
```

**Outcome:** LLM is able to infer:
- `Tetris` is a specific **Product**,
- <- *owned* by a specific **Franchise**,
- <- *served* by a specific **Team**,
- <- *led* by a specific **Person**,
- <- with several other **Persons** *reporting to* them.
- Return list of those **Persons**.

Crucially, LLM does not need to understand these relationships in advance,  
to succeed at querying. 

Neither does LLM need to read the contents of every node,  
preserving context window.

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

```bash
ontology --help
```
