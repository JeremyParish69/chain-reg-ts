import type { QueryPlan } from "../evaluation/plan/QueryPlan.js";
import type { ColumnId } from "../relational/Column.js";
import type { Databases } from "../relational/Databases.js";
import type { RowView } from "../relational/RowView.js";
import type { ColumnInput } from "../types/ColumnInput.js";
import type { Action } from "./Action.js";
import { mapQueryRowsToInsertRows } from "./mapQueryRowsToInsertRows.js";

export class PopulateTableFromQueryAction implements Action {
  constructor(
    private dbName: string,
    private tableName: string,
    private targetColumns: string[],
    private queryPlan: QueryPlan,
  ) {}

  apply(databases: Databases) {
    const db = databases.requireByName(this.dbName);
    const table = db.tables.requireByName(this.tableName);

    const columnIds: ColumnId[] = this.targetColumns.map((name) =>
      table.columns.requireIdByName(name),
    );

    if (this.queryPlan.columns.length !== this.targetColumns.length) {
      throw new Error(
        "Query result column count does not match target column count.",
      );
    }

    const queryRows: IterableIterator<RowView> = this.queryPlan.root.execute();

    const inputRows: Map<ColumnId, ColumnInput>[] = mapQueryRowsToInsertRows(
      queryRows,
      columnIds,
    );

    const updatedDatabase = db.addRows(this.tableName, inputRows);

    return databases.update(updatedDatabase);
  }
}
