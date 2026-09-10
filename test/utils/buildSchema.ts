import { Table, type TableId } from "../../src/relational/Table.js";
import { Database, type DatabaseId } from "../../src/relational/Database.js";
import { type ColumnSpec, type ColumnId, type InlineColumnSpec } from "../../src/relational/Column.js";
import { type ForeignKeyId } from "../../src/relational/ForeignKey.js";
import { type IndexSpec, type IndexId } from "../../src/relational/Index.js";
import { type IdService } from "../../src/types/IdAllocator.js";
import { type CheckSpec, type ConstraintSpec, type ForeignKeySpec } from "../../src/relational/Constraint.js";
import { type UniqueId } from "../../src/relational/Unique.js";
import { type ResolvedDelete } from "../../src/types/ResolvedDelete.js";
import { LiteralExpressionNode } from "../../src/ast/expression/LiteralExpressionNode.js";
import { ComparisonPredicateNode } from "../../src/ast/predicate/ComparisonPredicateNode.js";
import { SQL_DECIMAL } from "../../src/types/SqlType.js";

let nextId = 1;

export function createTestIdService(): IdService {

  return {
    nextDatabaseId: () => nextId++ as DatabaseId,
    nextTableId: () => nextId++ as TableId,
    nextColumnId: () => nextId++ as ColumnId,
    nextIndexId: () => nextId++ as IndexId,
    nextUniqueId: () => nextId++ as UniqueId,
    nextForeignKeyId: () => nextId++ as ForeignKeyId,
  };
}

export function createTableTestSpec(
  name: string,
  columns?: Record<string, Omit<InlineColumnSpec, "name">> | InlineColumnSpec[],
  constraints?: Record<string, ConstraintSpec> | ConstraintSpec[],
):  [
      string,
      InlineColumnSpec[] | undefined,
      ConstraintSpec[] | undefined,
    ]
{
  const columnList = Array.isArray(columns)
    ? columns
    : columnSchemaToList(columns)
  ;

  const constraintList = Array.isArray(constraints)
    ? constraints
    : constraintSchemaToList(constraints)
  ; 

  return [name, columnList, constraintList];
}

function columnSchemaToList(
  schema?: Record<string, Omit<InlineColumnSpec, "name">>,
): InlineColumnSpec[] {
  if (!schema) return [];
  const specs: InlineColumnSpec[] = []; 
  for (const [name, spec] of Object.entries(schema)) {
    specs.push({name, ...spec});
  }
  return specs;
}

function constraintSchemaToList(
  schema?: Record<string, ConstraintSpec>,
): ConstraintSpec[] {
  if (!schema) return [];
  const specs: ConstraintSpec[] = []; 
  for (const [name, spec] of Object.entries(schema)) {
    specs.push({ ...spec, name});
  }
  return specs;
}

export function createDelete(
  table: Table,
  rowNum: number,
): ResolvedDelete {
  return {
    rowNum,
    oldRow: table.requireRow(rowNum),
  };
}

export function createColumnTestSpec(
  overrides: Partial<ColumnSpec> = {},
): ColumnSpec {
  return {
    name: "c1",
    type: SQL_DECIMAL,
    nullable: true,
    ...overrides,
  };
}

export function createIndexTestSpec(
  overrides: Partial<IndexSpec> = {},
): IndexSpec {
  return {
    name: "i1",
    columns: ["c1"],
    unique: false,
    ...overrides,
  };
}

export function createCheckTestSpec(
  overrides: Partial<CheckSpec> = {},
): Omit<CheckSpec, "kind"> {
  return {
    name: "chk1",
    predicate: new ComparisonPredicateNode(
      new LiteralExpressionNode(1),
      "eq",
      new LiteralExpressionNode(1)
    ),
    ...overrides,
  };
}

export function createForeignKeyTestSpec_Table(
  overrides: Partial<{
    name: string,
    columns: ColumnId[],
    reverseIndex: IndexId,
    parentTable: TableId,
    parentColumns: ColumnId[],
    parentIndex: IndexId,
  }> = {},
): {
  name: string,
  columns: ColumnId[],
  reverseIndex: IndexId,
  parentTable: TableId,
  parentColumns: ColumnId[],
  parentIndex: IndexId,
} {
  const ids = createTestIdService();

  const columns = overrides.columns ?? [ids.nextColumnId()];
  const parentColumns = overrides.parentColumns ?? columns;

  return {
    name: "fk1",
    columns,
    reverseIndex: overrides.reverseIndex ?? ids.nextIndexId(),
    parentTable: overrides.parentTable ?? ids.nextTableId(),
    parentColumns,
    parentIndex: overrides.parentIndex ?? ids.nextIndexId(),
    ...overrides,
  };
}

export function createForeignKeyTestSpec_Database(
  overrides: Partial<ForeignKeySpec & {
    reverseIndex: string,
  }> = {},
): Omit<ForeignKeySpec, "kind"> & {
  reverseIndex: string,
} {
  return {
    name: "fk1",
    columns: ["c1"],
    parentTable: "t1",
    parentColumns: ["c1"],
    reverseIndex: "i1",
    ...overrides,
  };
}

export function buildTableWithForeignKey() {
    const table = buildTable()
      .createColumn(createColumnTestSpec({
        name: "c1",
      }))
      .createIndex(createIndexTestSpec({
        name: "ri",
        columns: ["c1"]
      }));

    return addForeignKeyByName(table, {
        name: "FK1",
        columns: ["c1"],
        reverseIndex: "ri",
      });
  }

export function addForeignKeyByName(
  table: Table,
  spec: {
    name: string;
    columns: string[];
    reverseIndex?: string;
  }
): Table {
  return table.createForeignKey(
    createForeignKeyTestSpec_Table({
      name: spec.name,
      columns: spec.columns.map(c =>
        table.columns.requireIdByName(c)
      ),
      reverseIndex: spec.reverseIndex
      ? table.indexes.requireIdByName(spec.reverseIndex)
      : undefined,
    })
  );
}

interface DefaultBuildOptions {
  ids?: IdService;
  name?: string;
}

interface BuildTableOptions {
  name?: string;
  columns?: number | string[];
}

export function buildTable(
  options: BuildTableOptions = {},
): Table {
  const {
    name = "t1",
    columns = [],
  } = options;

  const ids = createTestIdService();

  const tableId = ids.nextTableId();

  let table = Table.create({id: tableId, name});

  const columnNames =
    typeof columns === "number"
      ? Array.from(
          { length: columns },
          (_, i) => `c${i + 1}`,
        )
      : columns;

  for (const columnName of columnNames) {
    table = table.createColumn({
      name: columnName,
      type: SQL_DECIMAL,
    });
  }

  return table;
}

interface BuildDatabaseOptions {
  ids?: IdService;
  name?: string;
  tables?: number | string[];
}

export function buildDatabase(
  options: BuildDatabaseOptions = {},
): Database {
  const {
    ids = createTestIdService(),
    name = "db1",
    tables = 0,//["t1"],
  } = options;

  const databaseId = ids.nextDatabaseId();

  const tableNames =
    typeof tables === "number"
      ? Array.from(
          { length: tables },
          (_, i) => `t${i + 1}`,
        )
      : tables;

  let database = Database.create({id: databaseId, name});

  for (const tableName of tableNames) {
    database = database.addTable(buildTable({
      name: tableName,
    }));
  }

  return database;
}

export function buildCompositeKeyDatabase(
  options: DefaultBuildOptions = {},
): Database {
  const {
    ids = createTestIdService(),
    name = "db1",
  } = options;

  const databaseId = ids.nextDatabaseId();

  return Database.create({id: databaseId, name})
    .addTable(
      buildTable({name: "parent", columns: ["c1", "c2"]})
        .createIndex({
          name: "A_B",
          columns: ["c1", "c2"],
          unique: true,
        })
    )
    .addTable(
      buildTable({name: "child", columns: ["c1", "c2"]})
        .createIndex({
          name: "A_B",
          columns: ["c1", "c2"],
          unique: false,
        })
    )
    .createForeignKey("child", {
      name: "fk",
      columns: ["c1", "c2"],
      reverseIndex: "A_B",
      parentTable: "parent",
      parentColumns: ["c1", "c2"],
    });
}

export function buildParentChildDatabase(
  options: DefaultBuildOptions = {},
): Database {
  const {
    ids = createTestIdService(),
    name = "db1",
  } = options;

  const databaseId = ids.nextDatabaseId();

  return Database.create({id: databaseId, name})
    .addTable(
      buildTable({name: "parent", columns: ["id"]})
        .createIndex({
          name: "i1",
          columns: ["id"],
          unique: true,
        })
    )
    .addTable(
      buildTable({name: "child", columns: ["ref"]})
        .createIndex({
          name: "ri1",
          columns: ["ref"],
          unique: false,
        })
    )
    .createForeignKey("child", createForeignKeyTestSpec_Database({
      name: "fk1",
      columns: ["ref"],
      reverseIndex: "ri1",
      parentTable: "parent",
      parentColumns: ["id"],
    }));
}