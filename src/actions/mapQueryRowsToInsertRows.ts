import type { ColumnId } from "../relational/Column.js";
import type { RowView } from "../relational/RowView.js";
import type { ColumnInput } from "../types/ColumnInput.js";

export function mapQueryRowsToInsertRows(
  rows: Iterable<RowView>,
  targetColumns: ColumnId[],
): Map<ColumnId, ColumnInput>[] {
  const inputRows: Map<ColumnId, ColumnInput>[] = [];

  for (const row of rows) {
    const inputRow = new Map<ColumnId, ColumnInput>();

    for (let i = 0; i < targetColumns.length; i++) {
      inputRow.set(targetColumns[i], row.values[i]);
    }

    inputRows.push(inputRow);
  }

  return inputRows;
}