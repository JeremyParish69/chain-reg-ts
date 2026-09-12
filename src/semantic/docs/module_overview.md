# Semantic Module Overview

## Purpose

The Semantic module transforms AST statements into schema-aware, executable representations.

AST
↓
Semantic Analysis
↓
Actions / Query Plans
↓
Execution

Semantic analysis resolves names, validates statement meaning, applies dialect rules, and binds AST nodes to executable runtime objects.

It does not own AST definitions, relational storage, or execution.

## Responsibilities

The Semantic module owns:

* Resolving database, table, and column references
* Validating AST constructs against relational schema
* Applying dialect-specific input and statement rules
* Resolving keywords and special expressions
* Converting AST nodes into resolved nodes
* Binding resolved nodes to executable expressions and predicates
* Converting statements into Actions or query plans
* Combining query metadata with explicit schema definitions when required

## Policy Resolution

Semantic analysis resolves the active engine policy through the execution context.

Policies may originate from:

* engine configuration
* dialect defaults
* dialect-specific strict rules

The resolved policy is supplied to relational construction actions when creating tables or columns.

For example:

* `ColumnPolicy` controls auto-increment behavior for a newly created column.
* `TablePolicy` controls table-level creation rules such as whether multiple auto-increment columns are permitted.

Column and table policies are therefore determined during semantic analysis rather than inferred independently by the Relational module.

## AST Resolution

AST nodes describe user intent and may contain unresolved names.

Semantic resolution uses the current relational context to resolve schema references and verify that referenced objects exist.

The general progression is:

AST node
↓
Resolved AST node
↓
Bound runtime object

For example, a column reference progresses from a column name to a `ColumnId`, then to the runtime information required for evaluation.

Resolution is schema-dependent; AST construction is not.

## Expression Resolution and Binding

`resolveExpression()` converts an `ExpressionNode` into a `ResolvedExpressionNode`.

Resolution recursively processes nested expressions and resolves schema-dependent references.

Expression forms include:

* Column references
* Binary expressions
* CASE
* Concatenation
* Temporal expressions
* SQL functions
* Default values

`bindExpression()` converts resolved nodes into executable `Expression` objects.

Binding incorporates runtime information needed for efficient evaluation.

## Predicates

Predicates follow the same resolution and binding model as expressions.

Column references are resolved against the relevant table, and nested expressions and predicates are processed recursively.

Binding produces executable `Predicate` objects used by query and mutation execution.

## SELECT Binding

`bindSelect()` converts a `SelectStatement` into a `QueryPlan`.

SELECT items contain expressions rather than being limited to physical column references. Each expression is resolved and bound to an executable `Expression<RowView>`.

The general flow is:

SELECT expressions
↓
Resolve expressions
↓
Bind expressions
↓
EvaluateNode
↓
QueryPlan

`*` is expanded into SELECT items representing all source-table columns.

The resulting `QueryPlan` contains `QueryColumn` metadata for each result column:

* result name
* SQL type
* nullability

Metadata is derived from the resolved expressions. Direct column expressions can inherit source metadata, while literals, CAST, CASE, and computed expressions derive metadata from their expression semantics.

SELECT aliases take precedence over derived names. Expressions without a suitable name receive a generated result-column name.

Query result metadata is independent of the physical source table. This allows query plans to be consumed by operations such as `INSERT ... SELECT` and CTAS.

Semantic binding does not execute the query.

## CREATE TABLE and CTAS

`bindCreateTable()` converts a `CreateTableStatement` into the actions required to construct the destination table.

An ordinary `CREATE TABLE` validates explicit column definitions and constraints and produces schema-modification actions.

For `CREATE TABLE ... AS SELECT`, the SELECT is bound using the normal SELECT analysis path.

The general CTAS flow is:

CREATE TABLE definition + SELECT
↓
Bind SELECT
↓
QueryPlan + QueryColumn[]
↓
Derive destination ColumnSpec[]
↓
Validate / unify definitions
↓
Create table / columns / constraints
↓
Populate from query result

`QueryColumn` contains only query-result metadata: name, type, and nullability. It does not cause source defaults, auto-increment settings, enum metadata, or constraints to be inherited by the CTAS destination.

Explicit CTAS column definitions may provide destination names and additional metadata. Semantic analysis combines them with query metadata according to dialect rules.

Dialect rules determine, among other things:

* whether explicit column names override query names
* whether column-list and query column counts must match
* whether constraints are permitted on CTAS

CTAS uses the normal table, column, and constraint actions, followed by a separate action that populates the completed table from the query result.

Actions are not executed during semantic binding. Therefore CTAS cannot resolve destination `ColumnId`s during binding because the destination table does not yet exist. The population action retains destination column names and resolves their IDs when it executes.

## Keywords and Special Expressions

Input keywords are represented separately from ordinary expression values.

Current categories include:

* `Keyword`
* `TemporalExpressionKeyword`
* `SqlFunctionKeyword`

Examples include:

* `DEFAULT`
* `CURRENT_TIMESTAMP`
* `CURRENT_DATE`
* `CURRENT_TIME`
* `NOW`
* `GETDATE`

Dialect rules determine which keywords and special expressions are permitted.

## DEFAULT

`DEFAULT` is represented by `DefaultValueNode` rather than as an ordinary expression.

Semantic analysis validates whether DEFAULT is legal in the relevant statement and column context.

The Semantic module determines whether the operation is permitted; Column remains responsible for resolving the actual column default and auto-increment behavior.

This distinguishes explicit `DEFAULT`, omitted insert values, and column-specific default resolution.

## INSERT

INSERT supports both VALUES and query-based input.

### INSERT ... VALUES

INSERT expressions cannot reference existing row values, so Semantic analysis validates that they do not require a `RowView`.

The general flow is:

Insert input
↓
AST expression
↓
Semantic validation
↓
Resolve / bind
↓
Column input
↓
Execution

`DEFAULT` is handled separately because its final value depends on the target column.

### INSERT ... SELECT

`INSERT ... SELECT` uses a bound `QueryPlan` as its row source.

The general flow is:

INSERT ... SELECT
↓
Bind source SELECT
↓
QueryPlan + target metadata
↓
InsertSelectAction
↓
Query execution
↓
Relational insertion

Semantic analysis validates query output count and type compatibility with the target columns.

The query result is mapped positionally to the target `ColumnId`s and passed through the normal relational `addRows()` path.

Query execution and relational insertion remain separate from semantic analysis.

## UPDATE

UPDATE expressions may reference existing columns because they are evaluated against affected `RowView`s.

The general flow is:

Update assignment
↓
AST expression
↓
Resolve
↓
Bind
↓
Expression<RowView>
↓
Execution

`DEFAULT`, temporal expressions, and SQL functions are handled according to their normal semantic and execution rules.

## Statement Binding

`SemanticAnalyzer` dispatches statements to statement-specific binders.

Examples include:

* `bindInsertInto()`
* `bindInsertValues()`
* `bindInsertSelect()`
* `bindUpdateSet()`
* `bindSelect()`
* Delete binders
* Schema-related binders
* `bindCreateTable()`

The general flow is:

Statement
↓
Semantic validation
↓
Resolution / binding
↓
Action or QueryPlan

Statement binding composes existing semantic mechanisms where appropriate. `bindSelect()` produces the source `QueryPlan` for `INSERT ... SELECT` and CTAS.

Semantic analysis prepares an operation but does not execute it.

Statement binders also resolve the applicable engine policy when producing schema-modification actions.

## Dialect Rules

Dialect-sensitive behavior is controlled through the active dialect rules.

Input rules include categories such as:

```ts
input: {
  keywords?: ReadonlySet<Keyword>;
  temporalExpressions?: ReadonlySet<TemporalExpressionKeyword>;
  functions?: ReadonlySet<SqlFunctionKeyword>;
}
```

Other rules govern semantic legality, including statement, column-input, and CTAS behavior.

CTAS rules include whether:

* CTAS is supported
* an explicit column list overrides query column names
* an explicit column list must match the query column count
* constraints are permitted on CTAS

These policies are represented by DDL rules including:

* `ctasColumnListOverridesQueryColumns`
* `ctasColumnListMustMatchQueryColumnCount`
* `ctasAllowsConstraints`

Semantic analysis obtains these rules through the engine's dialect configuration rather than hard-coding dialect-specific behavior.

## Semantic vs Relational Validation

Semantic validation determines whether a requested operation is meaningful and executable.

Examples include:

* Referenced database, table, or column does not exist
* Unsupported dialect keyword
* Invalid statement structure
* Column reference used where a row context is unavailable
* Explicit input prohibited by a dialect rule
* Unsupported CTAS combination

The Relational module remains responsible for relational-state invariants such as:

* Primary keys
* Unique constraints
* Foreign keys
* Check constraints
* Row validity
* Index consistency

Semantic analysis determines whether statement input is permitted by the active policy. The Relational module enforces the resulting object-level policy.

For auto-increment columns, Semantic validation includes whether explicit values and explicit `DEFAULT` are permitted.

## Semantic vs Execution

The primary boundary is:

Semantic
↓
Action / QueryPlan
↓
Execution

Semantic analysis may resolve names, validate inputs, bind expressions, and construct query plans, but it does not mutate relational state or execute query plans.

Execution consumes the representations produced by Semantic.

The deferred boundary is important for CTAS because destination objects must be created before their `ColumnId`s can be resolved for population.

## Module Boundaries

Semantic sits between statement representation and execution:

AST
↓
Semantic
↓
Actions / QueryPlans
↓
Execution
↓
Relational

Semantic consumes:

* AST nodes
* Relational schema information
* Dialect rules
* Engine execution context

Semantic produces:

* Resolved AST nodes
* Executable expressions and predicates
* Actions
* Query plans

Semantic does not own:

* AST node definitions
* Relational tables or persistent rows
* Relational mutation algorithms
* Action or query-plan execution
* Mapping-specific expression contexts

Its role is the translation boundary between statement structure and executable relational operations.