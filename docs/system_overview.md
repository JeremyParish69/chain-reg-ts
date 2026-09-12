# System Overview

Embedded in-memory ETL and validation engine for hierarchical structured datasets such as filesystem registries, JSON documents, and similar sources.

The system treats external structured data as a relational database:

```text
External Data
    ↓
Discovery
    ↓
Import
    ↓
Schema Inference
    ↓
Database Construction
    ↓
Relational Database
    ↓
Mutation / Query
    ↓
Validation
    ↓
Export
```

## Capabilities

* Declarative hierarchical discovery
* Typed discovery results with scoped captures and stable import identities
* Declarative import mappings from discovered values to relational tables
* Expression-based computed fields and captures
* Automatic mapping of nested structured data
* Automatic inference of array mappings
* Automatic relational schema inference
* Immutable relational database representation
* SQL-like mutation support
* Deterministic query execution through compiled query plans
* Immediate relational constraint enforcement (PRIMARY KEY, UNIQUE, FOREIGN KEY, CHECK)
* Deferred business validation independent of import
* Referential actions (RESTRICT, CASCADE, SET NULL, NO ACTION)
* Reusable fluent expression and predicate DSL
* Immutable transactional execution

## Design Principles

* Immutable persistent data structures
* Deterministic execution
* Discovery is independent of import
* Import is independent of schema inference and validation
* Expressions are reusable across discovery, import, and execution through context types
* Import identities are independent of business keys
* Automatic inference for common import scenarios
* Explicit configuration overrides inferred behavior
* Separation of discovery, import, schema inference, execution, validation, and export
* Stable runtime identifiers with case-insensitive user-facing names
* Pure execution over immutable database state
* Discovery is independent of the underlying storage medium
* Navigation and decoding are separate concerns

## Execution Model

* Discovery traverses hierarchical data through navigators and optional decoders to produce immutable `DiscoveryResult`s.
* Import nodes consume discovery results to produce immutable `ImportResult`s.
* Import mappings evaluate expressions over captured values to produce relational fields.
* Import results sharing the same import identity are assembled into logical relational rows.
* Schema inference constructs a relational schema from imported data.
* Database construction builds immutable relational objects.
* `ImportPipeline` returns discoveries, imports, schema, and constructed databases.
* The engine installs imported databases through `engine.install(...)`.
* Semantic analysis binds schema references and compiles executable mutations and queries.
* Mutations execute as immutable state transformations.
* Queries execute as compiled query plans over immutable database snapshots.
* Validation evaluates business rules against relational databases without modifying committed state.

## Interface Layer

* Fluent builder API for discovery, import mappings, SQL statements, expressions, and predicates
* Compile-time and runtime enforcement of valid builder sequences
* Structured AST representation for SQL
* Direct runtime expressions for discovery and import
* SQL operations include DDL, DML, queries, and query-based table creation where supported by the active dialect.

## Typical Use Cases

* Registry import and validation
* Configuration management
* Metadata repositories
* Structured filesystem datasets
* ETL pipelines requiring deterministic relational processing
* Safe editing and validation prior to export