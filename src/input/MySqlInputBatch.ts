import { InputBatch } from "./InputBatch.js";
import { type InlineColumnSpec } from "../relational/Column.js";
import { type ConstraintSpec } from "../relational/Constraint.js";
import {
  type QueryStatement,
  type Statement,
} from "../statements/Statement.js";
import { type PredicateNode } from "../ast/predicate/PredicateNode.js";
import type { UpdateInput } from "../types/UpdateInput.js";
import type { InsertInput } from "../types/InsertInput.js";
import type { ExpressionNode } from "../ast/expression/ExpressionNode.js";
import type { ColumnValue } from "../types/ColumnValue.js";
import type { SelectInput } from "../types/SelectInput.js";

export class MySqlInputBatch extends InputBatch {
  constructor(executeStatement: (stmt: Statement) => void) {
    super(executeStatement);
  }

  begin() {
    return super.begin();
  }

  commit() {
    return super.commit();
  }

  useDatabase(dbName: string) {
    return super.useDatabase(dbName);
  }

  createDatabase(dbName: string) {
    return super.createDatabase(dbName);
  }

  createTable(
    table: string,
    columnList?: InlineColumnSpec[],
    constraintList?: ConstraintSpec[],
  ) {
    return super.createTable(table, columnList, constraintList);
  }

  as(
    query: QueryStatement,
    fragment: string = "AS",
  ) {
    return super.as(query);
  }

  alterTable(table: string) {
    return super.alterTable(table);
  }

  // Add allows adding multiple columns
  // call .add().add() vs .add([col_1, col_2]) vs record
  // TODO
  add(columnName: string, inlineColumnSpec: InlineColumnSpec) {
    return super.addColumn(columnName, inlineColumnSpec);
  }

  addConstraint(name: string) {
    return super.addConstraint(name);
  }

  unique(columns: string[]) {
    return super.unique(columns);
  }

  check(predicate: PredicateNode) {
    return super.check(predicate);
  }

  insertInto(table: string, columns: string[] = []) {
    return super.insertInto(table, columns);
  }

  values(data: InsertInput[][]) {
    return super.values(data);
  }

  update(table: string) {
    return super.update(table);
  }

  set(data: Record<string, UpdateInput>) {
    return super.set(data);
  }

  deleteFrom(table: string) {
    return super.deleteFrom(table);
  }

  returning(cols: string[]) {
    return super.returning(cols);
  }

  select(
    expressionsOrQuery: SelectInput[] | "*" | QueryStatement,
  ) {
    return super.select(expressionsOrQuery);
  }

  from(name: string) {
    return super.from(name);
  }

  where(predicate: PredicateNode) {
    return super.where(predicate);
  }
}
