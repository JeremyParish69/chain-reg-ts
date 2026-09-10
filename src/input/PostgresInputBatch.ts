import { InputBatch } from "./InputBatch.js";
import { type InlineColumnSpec } from "../relational/Column.js";
import { type ConstraintSpec } from "../relational/Constraint.js";
import {
  type QueryStatement,
  type Statement,
} from "../statements/Statement.js";
import { type ReferentialAction } from "../relational/ReferentialAction.js";
import { type PredicateNode } from "../ast/predicate/PredicateNode.js";
import type { UpdateInput } from "../types/UpdateInput.js";
import type { InsertInput } from "../types/InsertInput.js";
import type { SelectInput } from "../types/SelectInput.js";

export class PostgresInputBatch extends InputBatch {
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
    constraintSchema?: Record<string, ConstraintSpec>,
  ) {
    return super.createTable(table, columnList, constraintSchema);
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

  addConstraint(name: string) {
    return super.addConstraint(name);
  }

  add(columnName: string, inlineColumnSpec: InlineColumnSpec) {
    return super.addColumn(columnName, inlineColumnSpec);
  }

  unique(columns: string[]) {
    return super.unique(columns);
  }

  check(predicate: PredicateNode) {
    return super.check(predicate);
  }

  foreignKey(columns: string[]) {
    return super.foreignKey(columns);
  }

  references(parentTable: string, parentColumns: string[]) {
    return super.references(parentTable, parentColumns);
  }

  onDelete(action: ReferentialAction) {
    return super.onDelete(action);
  }

  onUpdate(action: ReferentialAction) {
    return super.onUpdate(action);
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
