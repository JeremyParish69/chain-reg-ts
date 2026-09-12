# Architecture

## Overall Flow

```text
External source
    ↓
Discovery
    ↓
Import
    ↓
Schema Inference
    ↓
Database Builder
    ↓
Relational Database
    ↓
Queries / Mutations
    ↓
Validation
    ↓
Export
```

The system is divided into three major layers:

* **Mapping** — converts external data into a relational representation.
* **Engine / Relational** — owns relational state, correctness, and execution.
* **Validation** — evaluates business rules independently of committed relational state.

---

# Mapping

The Mapping layer transforms external data into relational rows.

It consists of four stages:

* Discovery
* Import
* Schema Inference
* Database Construction

Discovery traverses arbitrary hierarchical data and produces immutable `DiscoveryResult`s. Discovery is composed of `DiscoveryNode`s, `DiscoveryNavigator`s, and optional `DiscoveryDecoder`s, allowing the same model to operate across filesystems, JSON, and other structured sources.

Import consumes discovery results using `ImportNode`s and `ImportMapping`s. Expressions transform captured values into relational fields while automatic inference handles common mapping scenarios.

Schema inference observes imported values to construct relational schema.

Finally, `DatabaseBuilder` combines schema and imported rows into immutable relational objects.

---

# Import Pipeline

`ImportPipeline` orchestrates the complete mapping process.

It returns an `ImportPipelineResult` containing:

* discoveries
* imports
* schema
* databases

This exposes intermediate stages for tooling and debugging while supporting installation through:

```ts
engine.install(result.databases);
```

---

# Engine and Relational

The Engine owns committed relational state and executes SQL.

The Relational module provides the immutable relational representation and structural correctness mechanisms used by the Engine.

Primary runtime components include:

* `Engine`
* `Transaction`
* `ExecutionContext`
* `Databases`
* `Database`
* `Table`

Semantic analysis resolves schema references and compiles expressions, predicates, mutations, and queries before execution.

Semantic analysis also resolves engine and dialect policy used by schema-modification actions.

Mutations produce immutable `Action`s.

Queries produce immutable `QueryPlan`s evaluated against relational snapshots and `RowView`s.

Relational constraints enforce structural integrity during execution.

---

### DDL and Query-Based Table Creation

DDL statements are analyzed semantically and converted into executable actions. `CREATE TABLE` may define columns and constraints explicitly, and supported dialects may also create and populate the table from a `SELECT` query (CTAS).

For CTAS, Semantic analysis binds the query into a `QueryPlan`, derives destination column metadata from its `QueryColumn[]`, and combines that metadata with any explicit column definitions according to dialect rules. Table creation and query-result population remain separate actions so that the Relational layer does not need to know that the rows originated from a query.

Dialect rules determine which CTAS forms are permitted, including whether explicit column lists must match the query column count and whether constraints are allowed.

---

### Query Plans

SELECT statements are semantically bound into immutable `QueryPlan`s.

A query plan contains:

- a plan root responsible for producing result rows
- `QueryColumn` metadata describing the result columns

SELECT expressions are resolved and bound into executable expressions and
evaluated by `EvaluateNode`. Result metadata is derived from the resolved
expressions rather than being limited to physical source-table columns.

This allows query results to represent source columns, literals, computed
expressions, CAST expressions, and other expression forms.

Query-plan metadata forms the schema contract for consumers such as
`INSERT ... SELECT` and `CREATE TABLE AS SELECT`.

---

`INSERT ... SELECT` combines these execution models: semantic analysis binds the source query into a `QueryPlan`, and an `InsertSelectAction` evaluates that plan and inserts the resulting rows through the relational insertion path.

---

# DSL

The DSL provides fluent builders for:

* discovery
* import mappings
* SQL statements
* expressions
* predicates

Runtime builders evaluate directly against typed contexts, while SQL builders construct ASTs for semantic analysis.

Expression nodes provide reusable fluent operations for composing expressions and predicates. Expression-producing arithmetic operations and predicate-producing comparisons are available across applicable expression nodes rather than being limited to column references.

---

# Validation

Validation is intentionally separate from relational storage and structural integrity.

The Relational layer enforces constraints required for relational correctness.

The Validation layer defines additional business rules and evaluates them against an existing relational database.

Validation rules reuse constraint statements and the existing SQL/semantic infrastructure. They execute inside transactions and roll back after evaluation, producing structured `ValidationReport`s rather than changing committed state.

---

# Core Invariants

* Tables and databases are immutable.
* Actions, query plans, expressions, and predicates operate without mutating committed state.
* Query execution does not mutate committed state.
* Schema references are resolved before execution.
* Referential propagation operates against immutable relational state.
* Structural validation belongs to the Relational/Engine layer.
* Business validation belongs to the Validation layer.
* Discovery is independent of import and relational schema.

---

# Architectural Boundary

```text
External Data
      │
      ▼
  Mapping Layer
      │
      ▼
Relational Database
      │
      ▼
 Engine / Relational
      │
      ▼
 Validation
      │
      ▼
   Export
```

The Mapping layer is responsible for **representing external data**.

The Engine and Relational layers are responsible for **relational state, execution, and structural correctness**.

The Validation layer is responsible for **business correctness**.