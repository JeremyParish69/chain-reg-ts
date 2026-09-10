import { type Action } from "../actions/Action.js";
import { AddCheckAction } from "../actions/AddCheckAction.js";
import { AddColumnAction } from "../actions/AddColumnAction.js";
import { AddForeignKeyAction } from "../actions/AddForeignKeyAction.js";
import { AddPrimaryKeyAction } from "../actions/AddPrimaryKeyAction.js";
import { DropForeignKeyAction } from "../actions/DropForeignKeyAction.js";

import { type AlterTableStatement } from "../statements/index.js";
import { CONSTRAINT_KIND } from "../relational/ConstraintKind.js";
import { PrimaryKey } from "../relational/PrimaryKey.js";
import { ForeignKey } from "../relational/ForeignKey.js";
import { Unique } from "../relational/Unique.js";
import { Check } from "../relational/Check.js";
import { type SemanticAnalyzer } from "./SemanticAnalyzer.js";
import { DropPrimaryKeyAction } from "../actions/DropPrimaryKeyAction.js";
import { DropCheckAction } from "../actions/DropCheckAction.js";
import { DropIndexAction } from "../actions/DropIndexAction.js";
import { AddIndexAction } from "../actions/AddIndexAction.js";
import { DropUniqueAction } from "../actions/DropUniqueAction.js";
import { type Column } from "../relational/Column.js";
import { AddUniqueConstraintAction } from "../actions/AddUniqueConstraintAction.js";

export function bindAlterTable(
  semantic: SemanticAnalyzer,
  stmt: AlterTableStatement,
) {
  const ctx = semantic.ctx;
  const stmtActions: Action[] = [];

  const dbName = ctx.requireDatabase().name;
  const tableName = stmt.table;
  const table = ctx.requireTable(tableName);

  if (stmt.op === "add_constraint") {
    const spec = stmt.constraint;

    let columns: Column[] = [];
    if ("columns" in spec && spec.columns) {
      columns = spec.columns?.map((c) => table.columns.requireByName(c));
    }

    switch (spec.kind) {
      case CONSTRAINT_KIND.foreignKey: {
        const parentTable = ctx.requireTable(spec.parentTable);
        spec.parentColumns.map((c) => parentTable.columns.requireIdByName(c));

        if (!ctx.rules.constraints.allowNullableForeignKeys) {
          for (const col of columns) {
            if (col.nullable) {
              throw new Error(
                `Foreign key column '${col.name}' cannot be nullable`,
              );
            }
          }
        }

        const reverseIndexName = ForeignKey.defaultIndexName(spec.name);

        stmtActions.push(
          new AddIndexAction(dbName, tableName, {
            name: reverseIndexName,
            columns: spec.columns,
            unique: false,
            nullsDistinct: ctx.rules.constraints.nullsDistinct,
          }),
        );

        const onDelete =
          spec.onDelete ?? ctx.rules.constraints.foreignKeyDefaultOnDelete;
        const onUpdate =
          spec.onUpdate ?? ctx.rules.constraints.foreignKeyDefaultOnUpdate;

        stmtActions.push(
          new AddForeignKeyAction(dbName, tableName, {
            ...spec,
            onDelete,
            onUpdate,
            reverseIndex: reverseIndexName,
          }),
        );

        break;
      }

      case CONSTRAINT_KIND.primaryKey:
        stmtActions.push(
          new AddIndexAction(dbName, tableName, {
            name: PrimaryKey.defaultIndexName(spec.name),
            columns: spec.columns,
            unique: true,
            nullsDistinct: ctx.rules.constraints.nullsDistinct,
          }),
        );

        stmtActions.push(new AddPrimaryKeyAction(dbName, tableName, spec));

        break;

      case CONSTRAINT_KIND.unique:
        if ((spec.columns === undefined) === (spec.using === undefined)) {
          throw new Error(
            "UNIQUE constraint requires exactly one of 'columns' or 'using'.",
          );
        }

        stmtActions.push(
          new AddUniqueConstraintAction(dbName, tableName, {
            name: spec.name,
            columns: spec.columns,
            using: spec.using,
            nullsDistinct: ctx.rules.constraints.nullsDistinct,
          }),
        );

        break;

      case CONSTRAINT_KIND.check:
        stmtActions.push(new AddCheckAction(dbName, tableName, spec));

        break;
    }
  } else if (stmt.op === "drop_constraint") {
    const constraintName = stmt.constraintName;

    const constraint = table.requireConstraintByName(constraintName);

    if (constraint instanceof PrimaryKey) {
      stmtActions.push(new DropPrimaryKeyAction(dbName, tableName));
    } else if (constraint instanceof Unique) {
      stmtActions.push(new DropUniqueAction(dbName, tableName, constraint.id));
      if (constraint.ownsIndex) {
        stmtActions.push(
          new DropIndexAction(dbName, tableName, constraint.index),
        );
      }
    } else if (constraint instanceof ForeignKey) {
      stmtActions.push(
        new DropForeignKeyAction(dbName, tableName, constraint.id),
      );
      stmtActions.push(
        new DropIndexAction(dbName, tableName, constraint.reverseIndex),
      );
    } else if (constraint instanceof Check) {
      stmtActions.push(new DropCheckAction(dbName, tableName, constraintName));
    } else {
      throw new Error(`Invalid Constraint detected: ${constraint}`);
    }
  } else if (stmt.op === "drop_primary_key") {
    stmtActions.push(new DropPrimaryKeyAction(dbName, tableName));
  } else if (stmt.op === "add_column") {
    stmtActions.push(
      new AddColumnAction(
        dbName,
        tableName,
        stmt.inlineColumnSpec,
        ctx.rules.autoIncrementColumnPolicy,
      ),
    );
  }

  //TODO, add the remaining ops (rename column, drop column, etc.)

  return stmtActions;
}
