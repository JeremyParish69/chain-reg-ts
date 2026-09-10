import { type Action } from "../actions/Action.js";
import { InsertRowsAction } from "../actions/InsertRowsAction.js";
import {
  type InsertIntoStatement,
  type QueryStatement,
} from "../statements/index.js";
import { type ColumnId, type Column } from "../relational/Column.js";
import { resolveTargetColumns } from "./resolveColumnList.js";
import { type SemanticAnalyzer } from "./SemanticAnalyzer.js";
import { assertInsertExpression, bindInsertExpression } from "./expression.js";
import { validateInputNode } from "./toExpressionNode.js";
import type { DefaultValueNode } from "../ast/DefaultValueNode.js";
import type { ColumnInput } from "../types/ColumnInput.js";
import { DEFAULT } from "../dialect/keywords.js";
import type { ExpressionNode } from "../ast/expression/ExpressionNode.js";
import { InsertSelectAction } from "../actions/InsertSelectAction.js";
import { bindSelect } from "./select.js";
import { isSameType } from "../types/SqlType.js";
import type { Table } from "../relational/Table.js";

export function bindInsertInto(
  semantic: SemanticAnalyzer,
  stmt: InsertIntoStatement,
) {
  const database = semantic.ctx.requireDatabase();
  const table = semantic.ctx.requireTable(stmt.table);
  const effectiveColumns = resolveTargetColumns(table, stmt.columns);

  if (stmt.values !== undefined) {
    return bindInsertValues(
      semantic,
      database.name,
      table,
      effectiveColumns,
      stmt.values,
    );
  }

  if (stmt.select !== undefined) {
    return bindInsertSelect(
      semantic,
      database.name,
      table,
      effectiveColumns,
      stmt.select,
    );
  }

  throw new Error("INSERT requires either VALUES or SELECT.");
}

function bindInsertSelect(
  semantic: SemanticAnalyzer,
  dbName: string,
  targetTable: Table,
  targetColumns: Column[],
  select: QueryStatement,
): Action[] {
  const queryPlan = bindSelect(semantic, select);

  const selectColumns = queryPlan.columns;

  if (selectColumns.length !== targetColumns.length) {
    throw new Error(
      "Column length mismatch between query statement and target columns.",
    );
  }

  for (let i = 0; i < targetColumns.length; i++) {
    if (!isSameType(targetColumns[i].type, selectColumns[i].type)) {
      throw new Error(`Query column type does not match target column type.`);
    }
  }

  return [
    new InsertSelectAction(
      dbName,
      targetTable.name,
      targetColumns.map((c) => c.id),
      queryPlan,
    ),
  ];
}

function bindInsertValues(
  semantic: SemanticAnalyzer,
  dbName: string,
  targetTable: Table,
  targetColumns: Column[],
  values: (ExpressionNode | DefaultValueNode)[][],
): Action[] {
  const ctx = semantic.ctx;

  assertAtLeastOneRowOfValues(values);

  const inputRows: Map<ColumnId, ColumnInput>[] = [];

  for (const row of values) {
    assertRowLengthMatchesColumnLength(row, targetColumns);

    const columnIdToColumnInputMap = new Map<ColumnId, ColumnInput>();

    for (let i = 0; i < targetColumns.length; i++) {
      const column = targetColumns[i];
      const valueNode = row[i];

      validateInputNode(valueNode, ctx);

      if (valueNode.kind === "default") {
        if (
          column.isAutoIncrement() &&
          !column.autoIncrementAllowsExplicitDefault
        ) {
          throw new Error(
            `AutoIncrement Column ${column.name} does not accept explicit value.`,
          );
        }

        columnIdToColumnInputMap.set(column.id, DEFAULT);

        continue;
      }

      if (
        column.isAutoIncrement() &&
        !column.autoIncrementAllowsExplicitValue
      ) {
        throw new Error(
          `AutoIncrement Column ${column.name} does not accept explicit value.`,
        );
      }

      assertInsertExpression(valueNode);

      const value = bindInsertExpression(valueNode).evaluate(undefined);

      columnIdToColumnInputMap.set(column.id, value);
    }

    inputRows.push(columnIdToColumnInputMap);
  }

  return [new InsertRowsAction(dbName, targetTable.name, inputRows)];
}

function assertAtLeastOneRowOfValues(
  values: (ExpressionNode | DefaultValueNode)[][],
): void {
  if (values.length === 0) {
    throw new Error(`INSERT must contain at least one row`);
  }
}

function assertRowLengthMatchesColumnLength(
  row: (ExpressionNode | DefaultValueNode)[],
  columns: Column[],
): void {
  if (row.length !== columns.length) {
    throw new Error(`Row length and Column length mismatch`);
  }
}
