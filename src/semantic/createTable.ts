import { type SemanticAnalyzer } from "./SemanticAnalyzer.js";
import { type CreateTableStatement } from "../statements/index.js";

import { type Action } from "../actions/Action.js";
import { CreateTableAction } from "../actions/CreateTableAction.js";
import { AddColumnAction } from "../actions/AddColumnAction.js";
import {
  type ColumnSpec,
  type InlineColumnSpec,
} from "../relational/Column.js";
import { type ConstraintSpec } from "../relational/Constraint.js";
import { AddForeignKeyAction } from "../actions/AddForeignKeyAction.js";
import { AddPrimaryKeyAction } from "../actions/AddPrimaryKeyAction.js";
import { AddCheckAction } from "../actions/AddCheckAction.js";
import { AddIndexAction } from "../actions/AddIndexAction.js";
import { CONSTRAINT_KIND } from "../relational/ConstraintKind.js";
import { PrimaryKey } from "../relational/PrimaryKey.js";
import { ForeignKey } from "../relational/ForeignKey.js";
import { AddUniqueConstraintAction } from "../actions/AddUniqueConstraintAction.js";
import type { QueryPlan } from "../evaluation/plan/QueryPlan.js";
import { bindSelect } from "./select.js";
import { normalizeIdentifier } from "../utils/normalizeIdentifier.js";
import { isAssignable } from "../types/SqlType.js";
import { ExecutionContext } from "../engine/ExecutionContext.js";
import { PopulateTableFromQueryAction } from "../actions/PopulateTableFromQueryAction.js";

export function bindCreateTable(
  semantic: SemanticAnalyzer,
  stmt: CreateTableStatement,
): Action[] {
  const stmtActions: Action[] = [];

  const ctx = semantic.ctx;

  const dbName = ctx.requireDatabase().name;

  const tableName: string = stmt.table;

  assertTableNameUnused(tableName, ctx);
  function assertTableNameUnused(
    tableName: string,
    ctx: ExecutionContext,
  ): void {
    if (ctx.getTable(tableName)) {
      throw new Error(`Table '${tableName}' already exists`);
    }
  }

  stmtActions.push(
    new CreateTableAction(dbName, tableName, ctx.rules.tablePolicy),
  );

  const queryPlan: QueryPlan | undefined = stmt.select
    ? bindSelect(semantic, stmt.select)
    : undefined;

  const columnSpecs: ColumnSpec[] = getColumnSpecsForStatement(
    stmt.columnList,
    queryPlan,
    ctx.rules.ddl.ctasColumnListOverridesQueryColumns,
    ctx.rules.ddl.ctasColumnListMustMatchQueryColumnCount,
  );
  function getColumnSpecsForStatement(
    columnList: InlineColumnSpec[] | undefined,
    queryPlan: QueryPlan | undefined,
    ctasColumnListOverridesQueryColumns: boolean,
    ctasColumnListMustMatchQueryColumnCount: boolean,
  ): ColumnSpec[] {
    if (!queryPlan) {
      return columnList ?? [];
    }

    const columnsFromQuery: ColumnSpec[] = queryPlan
      ? getColumnSpecsFromQueryPlan(queryPlan)
      : [];
    function getColumnSpecsFromQueryPlan(
      queryPlan: QueryPlan,
    ): ColumnSpec[] {
      return queryPlan.columns.map((qc) => ({
        name: qc.name,
        type: qc.type,
        nullable: qc.nullable,
      }));
    }

    const columnSpecs: ColumnSpec[] = unifyColumnSpecSets(
      columnList ?? [],
      columnsFromQuery,
      ctasColumnListOverridesQueryColumns,
      ctasColumnListMustMatchQueryColumnCount,
    );
    function unifyColumnSpecSets(
      columnsFromDefinition: ColumnSpec[],
      columnsFromQuery: ColumnSpec[],
      ctasColumnListOverridesQueryColumns: boolean,
      ctasColumnListMustMatchQueryColumnCount: boolean,
    ): ColumnSpec[] {
      assertNoDuplicateColumnNames(columnsFromDefinition);
      assertNoDuplicateColumnNames(columnsFromQuery);

      if (
        ctasColumnListMustMatchQueryColumnCount &&
        columnsFromDefinition.length > 0 &&
        columnsFromDefinition.length !== columnsFromQuery.length
      ) {
        throw new Error(`CTAS column list count does not match query column count`);
      }

      if (ctasColumnListOverridesQueryColumns) {
        return unifyPositionalColumnSpecs(
          columnsFromDefinition,
          columnsFromQuery,
        );
      }

      return unifyNamedColumnSpecs(
        columnsFromDefinition,
        columnsFromQuery,
      );

      function unifyPositionalColumnSpecs(
        definitions: ColumnSpec[],
        queryColumns: ColumnSpec[],
      ): ColumnSpec[] {
        return queryColumns.map((queryColumn, index) => {
          const definitionColumn = definitions[index];

          return definitionColumn
            ? unifyColumnSpecs(definitionColumn, queryColumn)
            : queryColumn;
        });
      }

      function unifyNamedColumnSpecs(
        definitions: ColumnSpec[],
        queryColumns: ColumnSpec[],
      ): ColumnSpec[] {
        const result: ColumnSpec[] = [];
        const addedNames = new Set<string>();

        for (const definitionColumn of definitions) {
          const normalizedName = normalizeIdentifier(definitionColumn.name);
          addedNames.add(normalizedName);

          const queryColumn = queryColumns.find(
            (column) =>
              normalizeIdentifier(column.name) === normalizedName,
          );

          result.push(
            queryColumn
              ? unifyColumnSpecs(definitionColumn, queryColumn)
              : definitionColumn,
          );
        }

        for (const queryColumn of queryColumns) {
          const normalizedName = normalizeIdentifier(queryColumn.name);

          if (!addedNames.has(normalizedName)) {
            result.push(queryColumn);
          }
        }

        return result;
      }

      function unifyColumnSpecs(
        definitionColumn: ColumnSpec,
        queryColumn: ColumnSpec,
      ): ColumnSpec {
        if (!isAssignable(
          queryColumn.type,
          definitionColumn.type,
        )) {
          throw new Error(
            `Cannot assign query column type ` +
            `${queryColumn.type.kind} to defined column type ` +
            `${definitionColumn.type.kind}`,
          );
        }

        return {
          ...definitionColumn,
          nullable:
            definitionColumn.nullable !== undefined
              ? definitionColumn.nullable
              : queryColumn.nullable,
        };
      }
    }

    assertNoDuplicateColumnNames(columnSpecs);
    function assertNoDuplicateColumnNames(
      specs: ColumnSpec[]
    ): void {
      const seen = new Set<string>();
      for (const spec of specs) {
        const specName = normalizeIdentifier(spec.name);
        if (seen.has(specName)) {
          throw new Error(`Duplicate column name '${spec.name}' in CREATE TABLE`);
        }
        seen.add(specName);
      }
    }

    assertAtLeastOneColumn(columnSpecs);
    function assertAtLeastOneColumn(columnSpecs: ColumnSpec[]): void {
      if (columnSpecs.length <= 0) {
        throw new Error(`Statements has no Column Definitions`);
      }
    }

    return columnSpecs;
  }

  for (const columnSpec of columnSpecs) {
    stmtActions.push(
      new AddColumnAction(
        dbName,
        tableName,
        columnSpec,
        ctx.rules.autoIncrementColumnPolicy,
      ),
    );
  }

  const constraintSpecs: ConstraintSpec[] = getConstraintSpecsForStatement(
    stmt.columnList,
    stmt.constraintList,
    ctx.rules.ddl.supportsInlineForeignKeys,
  );
  function getConstraintSpecsForStatement(
    inlineColumnList: InlineColumnSpec[] | undefined,
    constraintList: ConstraintSpec[] | undefined,
    supportsInlineForeignKeys: boolean,
  ): ConstraintSpec[] {
    const inlineConstraints = inlineColumnList
      ? getConstraintSpecsFromColumnSpecs(inlineColumnList)
      : [];
    function getConstraintSpecsFromColumnSpecs(
      inlineColumnList: InlineColumnSpec[]
    ): ConstraintSpec[] {
      const specs: ConstraintSpec[] = []; 
      for (const inlineColumnSpec of inlineColumnList) {
        specs.push(
          ...constraintSpecsFromColumnSpec(inlineColumnSpec),
        );
      }
      return specs;
    }
    assertNoDuplicateConstraintNames(inlineConstraints);
    assertInlineForeignKeys(
      inlineConstraints,
      supportsInlineForeignKeys,
    );
    function assertInlineForeignKeys(
      inlineConstraintSpecs: ConstraintSpec[],
      supportsInlineForeignKeys: boolean,
    ): void {
      if (supportsInlineForeignKeys) {
        return;
      }

      for (const spec of inlineConstraintSpecs) {
        if (spec.kind === CONSTRAINT_KIND.foreignKey) {
          throw new Error(`Dialect does not allow inline Foreign Keys.`);
        }
      }
    }

    const tableConstraints = constraintList ?? [];
    assertNoDuplicateConstraintNames(tableConstraints);

    const constraintSpecs: ConstraintSpec[] = [
      ...inlineConstraints,
      ...tableConstraints,
    ];
    assertNoDuplicateConstraintNames(constraintSpecs);
    function assertNoDuplicateConstraintNames(
      specs: ConstraintSpec[]
    ): void {
      const seen = new Set<string>();
      for (const spec of specs) {
        const specName = normalizeIdentifier(spec.name);
        if (seen.has(specName)) {
          throw new Error(`Duplicate constraint name '${spec.name}' in CREATE TABLE`);
        }
        seen.add(specName);
      }
    }
    assertOnlyOnePrimaryKey(constraintSpecs);
    function assertOnlyOnePrimaryKey(
      constraintSpecs: ConstraintSpec[]
    ): void {
      const primaryKeyCount = constraintSpecs.filter(
        (c) => c.kind === CONSTRAINT_KIND.primaryKey,
      ).length;

      if (primaryKeyCount > 1) {
        throw new Error(`Multiple Primary Keys defined`);
      }
    }

    return constraintSpecs;
  }

  constraintSpecs.forEach(spec => {
    stmtActions.push(
      ...getActionsForConstraint(
        dbName,
        tableName,
        spec,
        ctx,
      )
    )
  });
  function getActionsForConstraint(
    dbName: string,
    tableName: string,
    spec: ConstraintSpec,
    ctx: ExecutionContext,
  ): Action[] {
    const actions: Action[] = [];

    switch (spec.kind) {
      case CONSTRAINT_KIND.foreignKey:
        const reverseIndexName = ForeignKey.defaultIndexName(spec.name);

        actions.push(
          new AddIndexAction(dbName, tableName, {
            name: reverseIndexName,
            columns: spec.columns,
            unique: false,
            nullsDistinct: ctx.rules.constraints.nullsDistinct,
          }),
        );

        actions.push(
          new AddForeignKeyAction(dbName, tableName, {
            ...spec,
            onDelete:
              spec.onDelete ??
              ctx.rules.constraints.foreignKeyDefaultOnDelete,
            onUpdate:
              spec.onDelete ??
              ctx.rules.constraints.foreignKeyDefaultOnUpdate,
            reverseIndex: reverseIndexName,
          }),
        );

        break;

      case CONSTRAINT_KIND.unique:
          if ((spec.columns === undefined) === (spec.using === undefined)) {
            throw new Error(
              "UNIQUE constraint requires exactly one of 'columns' or 'using'.",
            );
          }

          actions.push(
            new AddUniqueConstraintAction(dbName, tableName, {
              name: spec.name,
              columns: spec.columns,
              using: spec.using,
              nullsDistinct: ctx.rules.constraints.nullsDistinct,
            }),
          );

          break;

        case CONSTRAINT_KIND.check:
          actions.push(new AddCheckAction(dbName, tableName, spec));

          break;

        case CONSTRAINT_KIND.primaryKey:
          actions.push(
            new AddIndexAction(dbName, tableName, {
              name: PrimaryKey.defaultIndexName(spec.name),
              columns: spec.columns,
              unique: true,
              nullsDistinct: ctx.rules.constraints.nullsDistinct,
            }),
          );

          actions.push(new AddPrimaryKeyAction(dbName, tableName, spec));

          break;

        default:
          break;
    }
    return actions;
  }

  if (queryPlan) {
    const targetColumnNames = columnSpecs.map(
      (columnSpec) => columnSpec.name,
    );

    stmtActions.push(
      new PopulateTableFromQueryAction(
        dbName,
        tableName,
        targetColumnNames,
        queryPlan,
      ),
    );
  }

  return stmtActions;
}

function constraintSpecsFromColumnSpec(
  colSpec: InlineColumnSpec,
): ConstraintSpec[] {
  const specs: ConstraintSpec[] = [];

  if (colSpec.primaryKey) {
    specs.push({
      kind: CONSTRAINT_KIND.primaryKey,
      name: `${colSpec.name}_pk`,
      columns: [colSpec.name],
    });
  }

  if (colSpec.unique) {
    specs.push({
      kind: CONSTRAINT_KIND.unique,
      name: `${colSpec.name}_uniq`,
      columns: [colSpec.name],
    });
  }

  if (colSpec.references) {
    specs.push({
      kind: CONSTRAINT_KIND.foreignKey,
      name: `${colSpec.name}_fk`,
      columns: [colSpec.name],
      parentTable: colSpec.references.table,
      parentColumns: [colSpec.references.column],
    });
  }

  if (colSpec.check) {
    specs.push({
      kind: CONSTRAINT_KIND.check,
      name: `${colSpec.name}_chk`,
      predicate: colSpec.check,
    });
  }

  return specs;
}