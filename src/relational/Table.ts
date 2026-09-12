import {
  type ColumnSpec,
  Column,
  assertTypeIndexable,
  type ColumnId,
  type ColumnPolicy,
} from "./Column.js";
import { type ColumnValue } from "../types/ColumnValue.js";
import { PrimaryKey } from "./PrimaryKey.js";
import { ForeignKey, type ForeignKeyId } from "./ForeignKey.js";
import { Check, type CheckId } from "./Check.js";
import { Unique, type UniqueId } from "./Unique.js";
import {
  Index,
  type IndexId,
  type IndexSpec,
  IndexUniquenessError,
  requiresIndexRebuild,
} from "./Index.js";
import { Immutable } from "../infrastructure/Immutable.js";
import { type RowView } from "./RowView.js";
import { normalizeIdentifier } from "../utils/normalizeIdentifier.js";
import { type CheckSpec } from "./Constraint.js";
import { type ReferentialAction } from "./ReferentialAction.js";
import { type ColumnInput } from "../types/ColumnInput.js";
import { IdAllocator } from "../types/IdAllocator.js";
import { NamedObjectStore } from "../infrastructure/NamedObjectStore.js";
import { type ResolvedUpdate } from "../types/ResolvedUpdate.js";
import { type ResolvedDelete } from "../types/ResolvedDelete.js";
import { bindPredicate, resolvePredicate } from "../semantic/predicate.js";
import {
  ConstraintViolationError,
  type ConstraintViolationParticipant,
} from "./ConstraintViolationError.js";
import { CONSTRAINT_KIND } from "./ConstraintKind.js";
import { arraysEqual } from "../utils/arrayHelpers.js";
import type { OrderedInputRow } from "../types/OrderedInputRow.js";
import type { SqlType } from "../types/SqlType.js";

export type TableId = number & { readonly __brand: "TableId" };

export type TablePolicy = {
  allowMultipleAutoIncrementColumns?: boolean;
};

export class Table extends Immutable {
  public id: TableId;
  public name: string;

  public columns: NamedObjectStore<Column, ColumnId>;

  public primaryKey: PrimaryKey | undefined;
  public indexes: NamedObjectStore<Index, IndexId>;
  public uniques: NamedObjectStore<Unique, UniqueId>;
  public foreignKeys: NamedObjectStore<ForeignKey, ForeignKeyId>;
  public checks: NamedObjectStore<Check, CheckId>;

  public rowAlive: boolean[];
  public numRows: number;

  public readonly columnIds;
  public readonly indexIds;
  public readonly uniqueIds;
  public readonly foreignKeyIds;
  public readonly checkIds;

  public readonly allowMultipleAutoIncrementColumns: boolean;

  public validate(): void {
    for (const column of this.columns.values()) {
      if (column.data.length !== this.numRows) {
        throw new Error(
          `Column ${column.name} contains ${column.data.length} values, expected ${this.numRows}.`,
        );
      }
    }
  }

  constructor(spec: { id: TableId; name: string }, policy?: TablePolicy) {
    super();

    this.id = spec.id;
    this.name = spec.name;

    this.columns = new NamedObjectStore();

    this.primaryKey = undefined;
    this.indexes = new NamedObjectStore();
    this.uniques = new NamedObjectStore();
    this.foreignKeys = new NamedObjectStore();
    this.checks = new NamedObjectStore();

    this.rowAlive = [];
    this.numRows = 0;

    this.columnIds = new IdAllocator<ColumnId>();
    this.indexIds = new IdAllocator<IndexId>();
    this.uniqueIds = new IdAllocator<UniqueId>();
    this.foreignKeyIds = new IdAllocator<ForeignKeyId>();
    this.checkIds = new IdAllocator<CheckId>();

    // Policy
    this.allowMultipleAutoIncrementColumns =
      policy?.allowMultipleAutoIncrementColumns ?? true;

    this.validate();
    this.seal();
  }

  public static create(
    spec: { id: TableId; name: string },
    policy?: TablePolicy,
  ): Table {
    return new Table(spec, policy);
  }

  public rename(newName: string): Table {
    return this.with({
      name: newName,
    } as Partial<this>);
  }

  public getColumnsInOrder(): Column[] {
    return Array.from(this.columns.values()).sort(
      (a, b) => a.position - b.position,
    );
  }

  public hasAutoIncrementColumn(): boolean {
    return this.columns.some((c) => c.isAutoIncrement());
  }

  public createColumn(spec: ColumnSpec, policy?: ColumnPolicy): Table {
    this.columns.assertNameUnused(spec.name);

    if (
      spec.nullable === false &&
      spec.defaultValue === undefined &&
      this.numRows > 0
    ) {
      throw new Error(
        `New non-nullable column ${spec.name} unable to backfill without a default value`,
      );
    }

    const [id, columnIds] = this.columnIds.allocate();

    const position = this.columns.size();

    const emptyColumn = Column.create({ ...spec, id, position }, policy);

    if (
      !this.allowMultipleAutoIncrementColumns &&
      emptyColumn.isAutoIncrement() &&
      this.hasAutoIncrementColumn()
    ) {
      throw new Error(`Table is not allowed multiple autoIncrement columns`);
    }

    const backfillValue = spec.defaultValue ?? null;

    const initializedColumn = emptyColumn.backfill(this.numRows, backfillValue);

    const updatedColumns = this.columns.add(initializedColumn);

    return this.with({
      columns: updatedColumns,
      columnIds,
    } as Partial<this>);
  }

  public removeColumn(name: string): Table {
    return this.removeColumnById(this.columns.requireIdByName(name));
  }

  public removeColumnById(id: ColumnId): Table {
    const column = this.columns.require(id);

    this.assertColumnUnreferenced(id);

    const updatedColumns = this.columns
      .mapValues((c) => c.tryDecrementPosition(column.position))
      .remove(id);

    const columnIdToPositionMap = new Map<ColumnId, number>();
    for (const column of updatedColumns.values()) {
      columnIdToPositionMap.set(column.id, column.position);
    }

    const updatedIndexes = this.indexes.mapValues((i) =>
      i.tryUpdateColumnIndexes(columnIdToPositionMap),
    );

    const tableWithUpdatedPositions = this.with({
      columns: updatedColumns,
      indexes: updatedIndexes,
    } as Partial<this>);

    const updatedChecks = this.checks.mapValues((chk) =>
      chk.tryBindPredicate(tableWithUpdatedPositions),
    );

    return tableWithUpdatedPositions.with({
      checks: updatedChecks,
    } as Partial<this>);
  }

  public renameColumn(name: string, newName: string): Table {
    return this.renameColumnById(this.columns.requireIdByName(name), newName);
  }

  public renameColumnById(id: ColumnId, newName: string): Table {
    const column = this.columns.require(id);

    const oldName = column.name;

    if (oldName === newName) return this;

    const normalizedOldName = normalizeIdentifier(oldName);
    const normalizedNewName = normalizeIdentifier(newName);

    if (normalizedOldName !== normalizedNewName) {
      this.columns.assertNameUnused(newName);
    }

    const renamedColumn = column.rename(newName);

    const updatedColumns = this.columns.update(renamedColumn);

    return this.with({
      columns: updatedColumns,
    } as Partial<this>);
  }

  public alterColumn(name: string, newType: SqlType): Table {
    return this.alterColumnById(this.columns.requireIdByName(name), newType);
  }

  public alterColumnById(id: ColumnId, newType: SqlType): Table {
    const column = this.columns.require(id);

    if (column.type === newType) return this;

    if (this.indexes.some((i) => i.referencesColumn(id))) {
      assertTypeIndexable(newType);
    }

    const updatedColumns = this.columns.update(column.alter(newType));

    const tableWithUpdatedColumns = this.with({
      columns: updatedColumns,
    } as Partial<this>);

    const updatedChecks = this.checks.mapValues((chk) =>
      chk.tryBindPredicate(tableWithUpdatedColumns),
    );

    for (const check of updatedChecks.values()) {
      tableWithUpdatedColumns.assertCheckAgainstExistingRows(check);
    }

    let updatedIndexes = this.indexes;
    if (requiresIndexRebuild(column.type, newType)) {
      updatedIndexes = this.indexes.mapValues((index) =>
        index.referencesColumn(id)
          ? index.build(tableWithUpdatedColumns.iterateAliveRows())
          : index,
      );
    }

    return tableWithUpdatedColumns.with({
      checks: updatedChecks,
      indexes: updatedIndexes,
    } as Partial<this>);
  }

  private assertUniqueConstraintNotDuplicated(columns: ColumnId[]): void {
    for (const index of this.indexes.values()) {
      if (index.unique && sameColumnSet(index.columns, columns)) {
        throw new Error(
          `Unique constraint on columns [${columns.join(", ")}] already exists`,
        );
      }
    }
  }

  public createPrimaryKey(spec: { name: string; columns: string[] }): Table {
    if (this.primaryKey) {
      throw new Error(`Primary Key ${this.primaryKey} already exists`);
    }

    this.assertConstraintNameUnused(spec.name);

    const columnIds = spec.columns.map((c) => this.columns.requireIdByName(c));

    columnIds.forEach((id) => {
      const column = this.columns.require(id);
      if (column.nullable !== false) {
        throw new Error(`Column ${column.name} must be 'NOT NULL'.`);
      }
    });

    const index = this.requireUniqueIndexByColumns(columnIds);

    return this.with({
      primaryKey: PrimaryKey.create({
        name: spec.name,
        index: index.id,
      }),
    } as Partial<this>);
  }

  public removePrimaryKey(): Table {
    this.requirePrimaryKey();

    return this.with({
      primaryKey: undefined,
    } as Partial<this>);
  }

  public *iterateAliveRows(): IterableIterator<RowView> {
    for (let i = 0; i < this.numRows; i++) {
      const row = this.getRowView(i);

      if (!row) continue;

      yield row;
    }
  }

  private assertReverseIndexMatchesColumns(
    indexId: IndexId,
    columns: ColumnId[],
  ): void {
    const index = this.indexes.require(indexId);
    if (!arraysEqual(index.columns, columns)) {
      throw new Error(
        `Reverse Index Columns does not match Foreign Key Columns`,
      );
    }
  }

  private assertReverseIndexNotUnique(indexId: IndexId): void {
    const index = this.indexes.require(indexId);
    if (index.unique === true) {
      throw new Error(`Reverse Index must not be unique`);
    }
  }

  public createForeignKey(spec: {
    name: string;
    columns: ColumnId[];
    reverseIndex: IndexId;
    parentTable: TableId;
    parentColumns: ColumnId[];
    parentIndex: IndexId;
    onDelete?: ReferentialAction;
    onUpdate?: ReferentialAction;
  }): Table {
    this.assertConstraintNameUnused(spec.name);

    this.assertReverseIndexMatchesColumns(spec.reverseIndex, spec.columns);

    this.assertReverseIndexNotUnique(spec.reverseIndex);

    const [id, foreignKeyIds] = this.foreignKeyIds.allocate();

    const foreignKey = ForeignKey.create({
      ...spec,
      id,
    });

    const updatedForeignKeys = this.foreignKeys.add(foreignKey);

    return this.with({
      foreignKeys: updatedForeignKeys,
      foreignKeyIds,
    } as Partial<this>);
  }

  public removeForeignKey(name: string): Table {
    return this.removeForeignKeyById(this.foreignKeys.requireIdByName(name));
  }

  public removeForeignKeyById(id: ForeignKeyId): Table {
    const fk = this.foreignKeys.require(id);

    return this.with({
      foreignKeys: this.foreignKeys.remove(id),
      indexes: this.indexes.remove(fk.reverseIndex),
    } as Partial<this>);
  }

  private assertCheckAgainstExistingRows(check: Check): void {
    for (const row of this.iterateAliveRows()) {
      if (check.predicate.evaluate(row)) {
        continue;
      }

      throw new ConstraintViolationError({
        constraintName: check.name,
        constraintKind: CONSTRAINT_KIND.check,
        participants: [
          {
            table: this.id,
            rowId: row.index,
            columns: check.columns,
            columnValues: Index.projectRow(
              row.values,
              check.columns.map((c) => this.columns.require(c).position),
            ),
          },
        ],
      });
    }
  }

  public createCheck(spec: Omit<CheckSpec, "kind">): Table {
    this.assertConstraintNameUnused(spec.name);

    const resolvedPredicate = resolvePredicate(spec.predicate, this);

    const boundPredicate = bindPredicate(resolvedPredicate, this);

    const [id, checkIds] = this.checkIds.allocate();

    const check = Check.create({
      ...spec,
      id,
      resolvedPredicate,
      predicate: boundPredicate,
    });

    this.assertCheckAgainstExistingRows(check);

    const updatedChecks = this.checks.add(check);

    return this.with({
      checks: updatedChecks,
      checkIds,
    } as Partial<this>);
  }

  private assertRowAgainstChecks(row: ColumnValue[]) {
    const rowView = {
      index: 0,
      values: row,
    };

    for (const check of this.checks.values()) {
      if (!check.predicate.evaluate(rowView)) {
        throw new Error(`Check constraint '${check.name}' violated`);
      }
    }
  }

  private assertColumnUnreferenced(id: ColumnId) {
    if (
      this.foreignKeys.some((c) => c.referencesColumn(id)) ||
      this.indexes.some((i) => i.referencesColumn(id)) ||
      this.checks.some((c) => c.referencesColumn(id))
    ) {
      throw new Error(
        `Column Id: ${id} is referenced by some Constraint or Index`,
      );
    }
  }

  public getPrimaryKey(): PrimaryKey | undefined {
    return this.primaryKey;
  }

  public requirePrimaryKey(): PrimaryKey {
    const primaryKey = this.primaryKey;
    if (!primaryKey) {
      throw new Error(`No Primary Key exists.`);
    }
    return primaryKey;
  }

  public renamePrimaryKey(newName: string): Table {
    const primaryKey = this.requirePrimaryKey();

    const oldName = primaryKey.name;

    if (oldName === newName) return this;

    const normalizedNewName = normalizeIdentifier(newName);
    const normalizedOldName = normalizeIdentifier(oldName);

    if (normalizedOldName !== normalizedNewName) {
      this.assertConstraintNameUnused(newName);
    }

    const renamedPrimaryKey = primaryKey.rename(newName);

    return this.with({
      primaryKey: renamedPrimaryKey,
    } as Partial<this>);
  }

  public renameForeignKey(oldName: string, newName: string): Table {
    return this.renameForeignKeyById(
      this.foreignKeys.requireIdByName(oldName),
      newName,
    );
  }

  public renameForeignKeyById(id: ForeignKeyId, newName: string): Table {
    const foreignKey = this.foreignKeys.require(id);

    const oldName = foreignKey.name;

    if (oldName === newName) return this;

    const normalizedOldName = normalizeIdentifier(oldName);
    const normalizedNewName = normalizeIdentifier(newName);

    if (normalizedOldName !== normalizedNewName) {
      this.assertConstraintNameUnused(newName);
    }

    const renamedForeignKey = foreignKey.rename(newName);

    const updatedForeignKeys = this.foreignKeys.update(renamedForeignKey);

    return this.with({
      foreignKeys: updatedForeignKeys,
    } as Partial<this>);
  }

  public getConstraintByName(
    name: string,
  ): PrimaryKey | ForeignKey | Check | Unique | undefined {
    const n = normalizeIdentifier(name);

    if (this.primaryKey && normalizeIdentifier(this.primaryKey.name) === n) {
      return this.primaryKey;
    }

    return (
      this.foreignKeys.getByName(name) ??
      this.checks.getByName(name) ??
      this.uniques.getByName(name)
    );
  }

  public requireConstraintByName(
    name: string,
  ): PrimaryKey | ForeignKey | Check | Unique {
    const constraint = this.getConstraintByName(name);
    if (!constraint) {
      throw new Error(`No constraint named: ${name}`);
    }
    return constraint;
  }

  private assertConstraintNameUnused(name: string): void {
    if (this.getConstraintByName(name)) {
      throw new Error(`Constraint name: ${name} already used`);
    }
  }

  public assertTableUnreferenced(id: TableId): void {
    for (const fk of this.foreignKeys.values()) {
      if (fk.parentTable === id) {
        throw new Error(`Foreign Key ${fk.name} references table: ${id}`);
      }
    }
  }

  public createUnique(spec: {
    name: string;
    indexName: string;
    ownsIndex: boolean;
  }): Table {
    this.assertConstraintNameUnused(spec.name);

    const index = this.indexes.requireByName(spec.indexName);

    if (index.unique !== true) {
      throw new Error("Referenced index is not unique");
    }

    const [id, uniqueIds] = this.uniqueIds.allocate();

    const unique = Unique.create({
      id,
      name: spec.name,
      index: index.id,
      ownsIndex: spec.ownsIndex,
    });

    const updatedUniques = this.uniques.add(unique);

    return this.with({
      uniques: updatedUniques,
      uniqueIds,
    } as Partial<this>);
  }

  public removeUnique(name: string): Table {
    return this.removeUniqueById(this.uniques.requireIdByName(name));
  }

  public removeUniqueById(id: UniqueId): Table {
    this.uniques.require(id);

    const updatedUniques = this.uniques.remove(id);

    return this.with({
      uniques: updatedUniques,
    } as Partial<this>);
  }

  public renameUnique(name: string, newName: string): Table {
    return this.renameUniqueById(this.uniques.requireIdByName(name), newName);
  }

  public renameUniqueById(id: UniqueId, newName: string): Table {
    const unique = this.uniques.require(id);

    const oldName = unique.name;

    if (oldName === newName) return this;

    const normalizedOldName = normalizeIdentifier(oldName);
    const normalizedNewName = normalizeIdentifier(newName);

    if (normalizedOldName !== normalizedNewName) {
      this.assertConstraintNameUnused(newName);
    }

    const renamedUnique = unique.rename(newName);

    const updatedUniques = this.uniques.update(renamedUnique);

    return this.with({
      uniques: updatedUniques,
    } as Partial<this>);
  }

  public resolveOrCreateBackingIndex(spec: {
    name: string;
    columns?: string[];
    using?: string;
    nullsDistinct: boolean;
  }): {
    table: Table;
    index: Index;
    created: boolean;
  } {
    let index: Index | undefined;

    if (spec.using) {
      index = this.indexes.requireByName(spec.using);

      return {
        table: this,
        index,
        created: false,
      };
    }

    if (!spec.columns || spec.columns.length < 1) {
      throw new Error(`Column names not provided for backing index`);
    }

    const columnIds = spec.columns.map((columnName) =>
      this.columns.requireIdByName(columnName),
    );

    index = this.getUniqueIndexByColumns(columnIds);

    if (index) {
      return {
        table: this,
        index,
        created: false,
      };
    }

    const tableWithNewIndex = this.createIndex({
      name: spec.name,
      columns: spec.columns,
      unique: true,
      nullsDistinct: true,
    });

    return {
      table: tableWithNewIndex,
      index: tableWithNewIndex.indexes.requireByName(spec.name),
      created: true,
    };
  }

  public createUniqueConstraint(spec: {
    name: string;
    columns?: string[];
    using?: string;
    nullsDistinct: boolean;
  }): Table {
    try {
      const backing = this.resolveOrCreateBackingIndex(spec);

      return backing.table.createUnique({
        name: spec.name,
        indexName: backing.index.name,
        ownsIndex: backing.created,
      });
    } catch (error) {
      if (error instanceof IndexUniquenessError) {
        const participants: ConstraintViolationParticipant[] = [];

        const columnPositions = error.columns.map(
          (c) => this.columns.require(c).position,
        );

        for (const row of this.iterateAliveRows()) {
          const rowProjection = Index.projectRow(row.values, columnPositions);

          if (!arraysEqual(rowProjection, error.projection)) {
            continue;
          }

          participants.push({
            table: this.id,
            rowId: row.index,
            columns: error.columns,
            columnValues: error.projection,
          });
        }

        throw new ConstraintViolationError({
          constraintName: spec.name,
          constraintKind: CONSTRAINT_KIND.unique,
          participants,
        });
      }

      throw error;
    }
  }

  public createIndex(spec: IndexSpec & { internal?: boolean }): Table {
    this.assertIndexNameUnused(spec.name);

    const columnIds = spec.columns.map((c) => this.columns.requireIdByName(c));

    if (spec.unique) {
      this.assertConstraintNameUnused(spec.name);
      this.assertUniqueConstraintNotDuplicated(columnIds);
    }

    const columnIndexes = columnIds
      .map((c) => this.columns.require(c))
      .map((c) => c.position);

    const [id, indexIds] = this.indexIds.allocate();

    let index = Index.create({
      ...spec,
      id,
      columns: columnIds,
      columnIndexes,
    });

    index = index.build(this.iterateAliveRows());

    const updatedIndexes = this.indexes.add(index);

    return this.with({
      indexes: updatedIndexes,
      indexIds,
    } as Partial<this>);
  }

  public removeIndex(name: string): Table {
    return this.removeIndexById(this.indexes.requireIdByName(name));
  }

  public removeIndexById(id: IndexId): Table {
    this.indexes.require(id);

    if (id === this.primaryKey?.index) {
      throw new Error(`Cannot remove index when referenced by Primary Key`);
    }

    if (
      Array.from(this.foreignKeys.values()).some((f) => f.reverseIndex === id)
    ) {
      throw new Error(`Cannot remove index when referenced by Foreign Key`);
    }

    if (Array.from(this.uniques.values()).some((u) => u.index === id)) {
      throw new Error(
        `Cannot remove index when referenced by Unique constraint`,
      );
    }

    const updatedIndexes = this.indexes.remove(id);

    return this.with({
      indexes: updatedIndexes,
    } as Partial<this>);
  }

  public removeCheck(name: string): Table {
    return this.removeCheckById(this.checks.requireIdByName(name));
  }

  public removeCheckById(id: CheckId): Table {
    this.checks.require(id);

    const updatedChecks = this.checks.remove(id);

    return this.with({
      checks: updatedChecks,
    } as Partial<this>);
  }

  private assertIndexNameUnused(name: string): void {
    if (this.indexes.hasName(name)) {
      throw new Error(`Index name ${name} is already used`);
    }
  }

  public renameIndex(name: string, newName: string): Table {
    return this.renameIndexById(this.indexes.requireIdByName(name), newName);
  }

  public renameIndexById(id: IndexId, newName: string): Table {
    const index = this.indexes.require(id);

    const oldName = index.name;

    if (oldName === newName) return this;

    const normalizedOldName = normalizeIdentifier(oldName);
    const normalizedNewName = normalizeIdentifier(newName);

    if (normalizedOldName !== normalizedNewName) {
      this.assertIndexNameUnused(newName);
      if (index.unique) {
        this.assertConstraintNameUnused(newName);
      }
    }

    const renamedIndex = index.rename(newName);

    const updatedIndexes = this.indexes.update(renamedIndex);

    return this.with({
      indexes: updatedIndexes,
    } as Partial<this>);
  }

  public renameCheck(name: string, newName: string): Table {
    return this.renameCheckById(this.checks.requireIdByName(name), newName);
  }

  public renameCheckById(id: CheckId, newName: string): Table {
    const check = this.checks.require(id);

    const oldName = check.name;

    if (oldName === newName) return this;

    const normalizedOldName = normalizeIdentifier(oldName);
    const normalizedNewName = normalizeIdentifier(newName);

    if (normalizedOldName !== normalizedNewName) {
      this.assertConstraintNameUnused(newName);
    }

    const renamedCheck = check.rename(newName);

    const updatedChecks = this.checks.update(renamedCheck);

    return this.with({
      checks: updatedChecks,
    } as Partial<this>);
  }

  public isRowAlive(rowNum: number): boolean {
    return (
      rowNum >= 0 && rowNum < this.numRows && this.rowAlive[rowNum] !== false
    );
  }

  public assertRowAlive(rowNum: number): void {
    if (!this.isRowAlive(rowNum)) {
      throw new Error(`Row ${rowNum} not alive`);
    }
  }

  public getRow(rowNum: number): ColumnValue[] | undefined {
    if (!this.isRowAlive(rowNum)) return undefined;

    const row: ColumnValue[] = [];
    for (const column of this.columns.values()) {
      const value = column.getDatumAtRow(rowNum);

      if (value === undefined) {
        return undefined;
      }

      row.push(value);
    }
    return row;
  }

  public requireRow(rowNum: number): ColumnValue[] {
    const row = this.getRow(rowNum);
    if (!row) {
      throw new Error(`Row Number ${rowNum} does not exist`);
    }
    return row;
  }

  public getRowView(rowNum: number): RowView | undefined {
    const values = this.getRow(rowNum);

    if (!values) return undefined;

    return {
      index: rowNum,
      values: values,
    };
  }

  public requireRowView(rowNum: number): RowView {
    const row = this.getRowView(rowNum);
    if (!row) {
      throw new Error(`Row Number ${rowNum} does not exist`);
    }
    return row;
  }

  private assertRowLength(row: unknown[]): void {
    if (row.length !== this.columns.size()) {
      throw new Error(`Resolved row length mismatch with table columns`);
    }
  }

  public addRows(rows: readonly OrderedInputRow[]): Table {
    let updatedColumns = this.columns;

    for (const row of rows) {
      this.assertRowLength(row);

      updatedColumns = updatedColumns.mapValues((column) =>
        column.addCell(row[column.position]),
      );
    }

    const updateNumRows = this.numRows + rows.length;

    const tableWithUpdatedColumns = this.with({
      columns: updatedColumns,
      numRows: updateNumRows,
    } as Partial<this>);

    for (let i = 0; i < rows.length; i++) {
      const resolvedRow = tableWithUpdatedColumns.requireRow(this.numRows + i);

      this.assertRowAgainstChecks(resolvedRow);
    }

    const updatedIndexes = this.indexes.mapValues((index) =>
      index.build(tableWithUpdatedColumns.iterateAliveRows()),
    );

    return tableWithUpdatedColumns.with({
      indexes: updatedIndexes,
    } as Partial<this>);
  }

  public orderInputs(inputs: Map<ColumnId, ColumnInput>): OrderedInputRow {
    const row = new Array<ColumnInput | undefined>(this.columns.size());

    for (const [columnId, input] of inputs) {
      const column = this.columns.require(columnId);
      row[column.position] = input;
    }

    return row;
  }

  public applyResolvedUpdates(updates: ResolvedUpdate[]): Table {
    let updatedColumns = this.columns;

    for (const update of updates) {
      this.assertRowLength(update.newRow);

      this.assertRowAgainstChecks(update.newRow);

      updatedColumns = updatedColumns.mapValues((column) =>
        column.updateCell(update.newRow[column.position], update.rowNum),
      );
    }

    const tableWithUpdatedColumns = this.with({
      columns: updatedColumns,
    } as Partial<this>);

    const updatedIndexes = this.indexes.mapValues((index) =>
      index.build(tableWithUpdatedColumns.iterateAliveRows()),
    );

    return tableWithUpdatedColumns.with({
      indexes: updatedIndexes,
    } as Partial<this>);
  }

  public updateRows(
    rowNums: readonly number[],
    rows: readonly OrderedInputRow[],
  ): {
    table: Table;
    updates: ResolvedUpdate[];
  } {
    if (rowNums.length !== rows.length) {
      throw new Error(
        "Number of row numbers must match number of update rows.",
      );
    }

    if (rowNums.length === 0) {
      return { table: this, updates: [] };
    }

    let updatedColumns = this.columns;

    const seen = new Set<number>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = rowNums[i];

      if (rowNum < 0 || rowNum >= this.numRows) {
        throw new Error(`Row Number: ${rowNum} does not exist.`);
      }

      if (seen.has(rowNum)) {
        throw new Error(
          `Row Number: ${rowNum} already updated in this operation.`,
        );
      }

      seen.add(rowNum);

      this.assertRowLength(row);

      updatedColumns = updatedColumns.mapValues((column) =>
        row[column.position] === undefined
          ? column
          : column.updateCell(row[column.position]!, rowNum),
      );
    }

    const tableWithUpdatedColumns = this.with({
      columns: updatedColumns,
    } as Partial<this>);

    const resolvedUpdates: ResolvedUpdate[] = [];

    for (const rowNum of rowNums) {
      const oldRow = this.requireRow(rowNum);
      const newRow = tableWithUpdatedColumns.requireRow(rowNum);

      this.assertRowAgainstChecks(newRow);

      resolvedUpdates.push({
        rowNum,
        newRow: [...newRow],
        oldRow: [...oldRow],
      });
    }

    const updatedIndexes = this.indexes.mapValues((index) =>
      index.build(tableWithUpdatedColumns.iterateAliveRows()),
    );

    return {
      table: tableWithUpdatedColumns.with({
        indexes: updatedIndexes,
      } as Partial<this>),
      updates: resolvedUpdates,
    };
  }

  public removeRows(deletes: ResolvedDelete[]): Table {
    const newRowAlive = [...this.rowAlive];
    for (const deleteRow of deletes) {
      newRowAlive[deleteRow.rowNum] = false;
    }

    const tableWithUpdatedRowAlive = this.with({
      rowAlive: newRowAlive,
    } as Partial<this>);

    const updatedIndexes = this.indexes.mapValues((index) =>
      index.build(tableWithUpdatedRowAlive.iterateAliveRows()),
    );

    return tableWithUpdatedRowAlive.with({
      indexes: updatedIndexes,
    } as Partial<this>);
  }

  public getUniqueIndexByColumns(columns: ColumnId[]): Index | undefined {
    for (const index of this.indexes.values()) {
      if (index.unique && arraysEqual(index.columns, columns)) {
        return index;
      }
    }
  }

  public requireUniqueIndexByColumns(columns: ColumnId[]): Index {
    const index = this.getUniqueIndexByColumns(columns);

    if (index) {
      return index;
    }

    throw new Error(
      `No UNIQUE index found for columns [${columns.join(", ")}] in this exact order`,
    );
  }
}

//used for: addUnique()
function sameColumnSet(a: ColumnId[], b: ColumnId[]): boolean {
  if (a.length !== b.length) return false;

  const setA = new Set(a);
  for (const col of b) {
    if (!setA.has(col)) return false;
  }
  return true;
}
