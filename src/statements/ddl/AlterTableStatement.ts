import { type BaseStatement, type StatementBuilder } from "../Statement.js";
import { type InlineColumnSpec } from "../../relational/Column.js";
import {
  type ForeignKeySpec,
  type ConstraintSpec,
} from "../../relational/Constraint.js";
import { CONSTRAINT_KIND } from "../../relational/ConstraintKind.js";
import { type ReferentialAction } from "../../relational/ReferentialAction.js";
import { type PredicateNode } from "../../ast/predicate/PredicateNode.js";

export type AlterTableStatement =
  | AlterAddColumn
  | AlterDropColumn
  | AlterRenameColumn
  | AlterModifyColumn
  | AlterAddConstraint
  | AlterDropConstraint
  | AlterDropPrimaryKey;

interface AlterTableBaseStatement extends BaseStatement {
  kind: "alter_table";
  table: string;
}

interface AlterAddColumn extends AlterTableBaseStatement {
  op: "add_column";
  columnList: InlineColumnSpec[];
}

interface AlterDropColumn extends AlterTableBaseStatement {
  op: "drop_column";
  columnNames: string[];
}

interface AlterRenameColumn extends AlterTableBaseStatement {
  op: "rename_column";
  from: string;
  to: string;
}

interface AlterModifyColumn extends AlterTableBaseStatement {
  op: "modify_column";
  columnList: InlineColumnSpec[];
}

export interface AlterAddConstraint extends AlterTableBaseStatement {
  op: "add_constraint";
  constraint: ConstraintSpec;
}

interface AlterDropConstraint extends AlterTableBaseStatement {
  op: "drop_constraint";
  constraintName: string;
}

interface AlterDropPrimaryKey extends AlterTableBaseStatement {
  op: "drop_primary_key";
}

type AlterTableBuilderState =
  | { state: "init" }
  | {
      state: "add_column";
      columnList: InlineColumnSpec[];
    }
  | { state: "drop_column"; columnNames: string[] }
  | { state: "rename_column"; from: string; to: string }
  | { state: "modify_column"; columnList: InlineColumnSpec[] }
  | {
      state: "add_constraint";
      partial: Partial<ConstraintSpec>;
      constraint?: ConstraintSpec;
    }
  | {
      state: "add_constraint_references";
      constraint: ForeignKeySpec;
    }
  | { state: "drop_constraint"; constraintName: string }
  | { state: "drop_primary_key" };

export class AlterTableBuilder implements StatementBuilder {
  private state: AlterTableBuilderState = { state: "init" };

  constructor(private table: string) {}

  private assertState<S extends AlterTableBuilderState["state"]>(
    expected: S,
  ): Extract<AlterTableBuilderState, { state: S }> {
    if (this.state.state !== expected) {
      throw new Error(
        `AlterTableBuilder in ${this.state.state} state, expected ${expected}`,
      );
    }
    return this.state as Extract<AlterTableBuilderState, { state: S }>;
  }

  private transitionState(next: AlterTableBuilderState) {
    this.state = next;
  }

  addColumn(columnList: InlineColumnSpec[]) {
    this.assertState("init");
    this.transitionState({ state: "add_column", columnList });
  }

  dropColumn(columnNames: string[]) {
    this.assertState("init");
    this.transitionState({ state: "drop_column", columnNames });
  }

  renameColumn(from: string, to: string) {
    this.assertState("init");
    this.transitionState({ state: "rename_column", from, to });
  }

  modifyColumn(columnList: InlineColumnSpec[]) {
    this.assertState("init");
    this.transitionState({ state: "modify_column", columnList });
  }

  dropConstraint(constraintName: string) {
    this.assertState("init");
    this.transitionState({ state: "drop_constraint", constraintName });
  }

  dropPrimaryKey() {
    this.assertState("init");
    this.transitionState({ state: "drop_primary_key" });
  }

  addConstraint(constraintName: string) {
    this.assertState("init");
    this.transitionState({
      state: "add_constraint",
      partial: { name: constraintName },
    });
  }

  primaryKey(columns: string[]) {
    this.state = this.assertState("add_constraint");

    const partial = this.state.partial;

    if (partial.kind) {
      throw new Error("Constraint kind already specified");
    }

    this.state.constraint = {
      ...partial,
      kind: CONSTRAINT_KIND.primaryKey,
      columns: columns,
    } as ConstraintSpec;
  }

  unique(columns: string[]) {
    this.state = this.assertState("add_constraint");

    const partial = this.state.partial;

    if (partial.kind) {
      throw new Error("Constraint kind already specified");
    }

    this.state.constraint = {
      ...partial,
      kind: CONSTRAINT_KIND.unique,
      columns: columns,
    } as ConstraintSpec;
  }

  check(predicate: PredicateNode) {
    this.state = this.assertState("add_constraint");

    const partial = this.state.partial;

    if (partial.kind) {
      throw new Error("Constraint kind already specified");
    }

    this.state.constraint = {
      ...partial,
      kind: CONSTRAINT_KIND.check,
      predicate: predicate,
    } as ConstraintSpec;
  }

  foreignKey(childColumns: string[]) {
    this.state = this.assertState("add_constraint");

    const partial = this.state.partial;
    if (partial.kind) {
      throw new Error("Constraint kind already specified");
    }

    this.state.partial = {
      ...partial,
      kind: CONSTRAINT_KIND.foreignKey,
      columns: childColumns,
    };
  }

  references(parentTable: string, parentColumns: string[]) {
    this.state = this.assertState("add_constraint");

    const partial = this.state.partial;

    if (
      partial.kind !== CONSTRAINT_KIND.foreignKey ||
      !partial?.columns ||
      !partial.name
    ) {
      throw new Error("Incomplete foreign key definition");
    }

    if (partial.kind !== CONSTRAINT_KIND.foreignKey) {
      throw new Error(
        `References is only used for foreign keys, not ${partial.kind}`,
      );
    }

    this.transitionState({
      state: "add_constraint_references",
      constraint: {
        ...partial,
        parentTable,
        parentColumns,
      } as ForeignKeySpec,
    });
  }

  onDelete(action: ReferentialAction) {
    this.state = this.assertState("add_constraint_references");

    this.state.constraint.onDelete = action;
  }

  onUpdate(action: ReferentialAction) {
    this.state = this.assertState("add_constraint_references");

    this.state.constraint.onUpdate = action;
  }

  getNextCalls() {
    switch (this.state.state) {
      case "init":
        return {
          required: [
            "addColumn",
            "dropColumn",
            "renameColumn",
            "modifyColumn",
            "addConstraint",
            "dropConstraint",
            "dropPrimaryKey",
          ],
          optional: [],
        };

      case "add_constraint":
        if (!this.state.constraint) {
          if (!this.state.partial.kind) {
            return {
              required: ["primaryKey", "unique", "foreignKey", "check"],
              optional: [],
            };
          }
          if (this.state.partial.kind === CONSTRAINT_KIND.foreignKey) {
            return { required: ["references"], optional: [] };
          }
        }
        break;

      case "add_constraint_references": {
        if (
          !this.state.constraint ||
          this.state.constraint.kind !== CONSTRAINT_KIND.foreignKey
        ) {
          return { required: [], optional: [] };
        }
        const optionalCalls = [];
        if (!this.state.constraint.onDelete) {
          optionalCalls.push("onDelete");
        }
        if (!this.state.constraint.onUpdate) {
          optionalCalls.push("onUpdate");
        }
        return { required: [], optional: optionalCalls };
      }

      default:
        return { required: [], optional: [] };
    }

    return { required: [], optional: [] };
  }

  createStatement(): AlterTableStatement {
    switch (this.state.state) {
      case "add_column":
        return {
          kind: "alter_table",
          op: "add_column",
          table: this.table,
          columnList: this.state.columnList,
        };

      case "drop_column":
        return {
          kind: "alter_table",
          op: "drop_column",
          table: this.table,
          columnNames: this.state.columnNames,
        };

      case "rename_column":
        return {
          kind: "alter_table",
          op: "rename_column",
          table: this.table,
          from: this.state.from,
          to: this.state.to,
        };

      case "modify_column":
        return {
          kind: "alter_table",
          op: "modify_column",
          table: this.table,
          columnList: this.state.columnList,
        };

      case "add_constraint":
        if (!this.state.constraint) {
          throw new Error(
            "Cannot create AlterTableStatement: constraint not fully defined",
          );
        }
        return {
          kind: "alter_table",
          op: "add_constraint",
          table: this.table,
          constraint: this.state.constraint,
        };

      case "add_constraint_references":
        if (!this.state.constraint) {
          throw new Error(
            "Cannot create AlterTableStatement: constraint not fully defined",
          );
        }
        return {
          kind: "alter_table",
          op: "add_constraint",
          table: this.table,
          constraint: this.state.constraint,
        };

      case "drop_primary_key":
        return {
          kind: "alter_table",
          op: "drop_primary_key",
          table: this.table,
        };

      case "drop_constraint":
        return {
          kind: "alter_table",
          op: "drop_constraint",
          table: this.table,
          constraintName: this.state.constraintName,
        };

      default:
        throw new Error("Incomplete ALTER TABLE statement");
    }
  }
}
