import { describe, it, expect } from 'vitest';
import { createTestPostgresSql } from '../utils/engineHelpers.ts';
import { and, col, or } from '../../src/ast/dsl.ts';
import { SQL_DECIMAL, SQL_VARCHAR } from '../../src/types/SqlType.ts';
import { createTableTestSpec } from '../utils/buildSchema.ts';

describe('Integration::select', () => {
  it("executes select * queries end-to-end", () => {
    const sql = createTestPostgresSql();

    sql.createDatabase("DB1").execute();

    sql.useDatabase("DB1").execute();

    sql.begin().execute();

    sql.createTable(...createTableTestSpec("Users", {
      Id: {
        type: SQL_DECIMAL,
        nullable: false,
      },
      Name: {
        type: SQL_VARCHAR,
        nullable: false,
      },
    })).execute();

    sql.commit().execute();

    sql.begin().execute();

    sql
      .insertInto("Users", ["Id", "Name"])
      .values([
        [1, "Alice"],
        [2, "Bob"],
      ])
      .execute();

    sql.commit().execute();

    const rows = sql
      .select("*")
      .from("Users")
      .execute();

    expect(rows[0]).toEqual([
      {
        index: 0,
        values: [1, "Alice"],
      },
      {
        index: 1,
        values: [2, "Bob"],
      },
    ]);
  });

  it("executes projected select queries end-to-end", () => {
    const sql = createTestPostgresSql();

    sql.createDatabase("DB1").execute();

    sql.useDatabase("DB1").execute();

    sql.createTable(...createTableTestSpec("Users", {
      Id: {
        type: SQL_DECIMAL,
        nullable: false,
      },
      Name: {
        type: SQL_VARCHAR,
        nullable: false,
      },
    })).execute();

    sql
      .insertInto("Users", ["Id", "Name"])
      .values([
        [1, "Alice"],
        [2, "Bob"],
      ])
      .execute();

    const rows = sql
      .select([col("Name")])
      .from("Users")
      .execute();

    expect(rows[0]).toEqual([
      {
        index: 0,
        values: ["Alice"],
      },
      {
        index: 1,
        values: ["Bob"],
      },
    ]);
  });

  it("executes where filtering end-to-end", () => {
    const sql = createTestPostgresSql();

    sql.createDatabase("DB1").execute();

    sql.useDatabase("DB1").execute();

    sql.createTable(...createTableTestSpec("Users", {
      Age: {
        type: SQL_DECIMAL,
        nullable: false,
      },
    })).execute();

    sql
      .insertInto("Users", ["Age"])
      .values([
        [10],
        [20],
        [30],
      ])
      .execute();

    const rows = sql
      .select("*")
      .from("Users")
      .where(
        col("Age").gt(15)
      )
      .execute();

    expect(rows[0]).toEqual([
      {
        index: 1,
        values: [20],
      },
      {
        index: 2,
        values: [30],
      },
    ]);
  });

  it("executes logical and predicates end-to-end", () => {
    const sql = createTestPostgresSql();

    sql.createDatabase("DB1").execute();

    sql.useDatabase("DB1").execute();

    sql.createTable(...createTableTestSpec("Users", {
      Age: {
        type: SQL_DECIMAL,
        nullable: false,
      },
      Score: {
        type: SQL_DECIMAL,
        nullable: false,
      },
    })).execute();

    sql
      .insertInto("Users", ["Age", "Score"])
      .values([
        [10, 100],
        [20, 100],
        [20, 50],
      ])
      .execute();

    const rows = sql
      .select("*")
      .from("Users")
      .where(
        and(
          col("Age").eq(20),
          col("Score").eq(100)
        )
      )
      .execute();

    expect(rows[0]).toEqual([
      {
        index: 1,
        values: [20, 100],
      },
    ]);
  });

  it("executes logical and predicates end-to-end", () => {
    const sql = createTestPostgresSql();

    sql.createDatabase("DB1").execute();

    sql.useDatabase("DB1").execute();

    sql.createTable(...createTableTestSpec("Users", {
      Age: {
        type: SQL_DECIMAL,
        nullable: false,
      },
      Score: {
        type: SQL_DECIMAL,
        nullable: false,
      },
    })).execute();

    sql
      .insertInto("Users", ["Age", "Score"])
      .values([
        [10, 100],
        [20, 100],
        [20, 50],
      ])
      .execute();

    const rows = sql
      .select("*")
      .from("Users")
      .where(
        and(
          col("Age").eq(20),
          col("Score").eq(100)
        )
      )
      .execute();

    expect(rows[0]).toEqual([
      {
        index: 1,
        values: [20, 100],
      },
    ]);
  });

  it("executes logical or predicates end-to-end", () => {
    const sql = createTestPostgresSql();

    sql.createDatabase("DB1").execute();

    sql.useDatabase("DB1").execute();

    sql.createTable(...createTableTestSpec("Users", {
      Age: {
        type: SQL_DECIMAL,
        nullable: false,
      },
    })).execute();

    sql
      .insertInto("Users", ["Age"])
      .values([
        [10],
        [20],
        [30],
      ])
      .execute();

    const rows = sql
      .select("*")
      .from("Users")
      .where(
        or(
          col("Age").eq(10),
          col("Age").eq(30)
        )
      )
      .execute();

    expect(rows[0]).toEqual([
      {
        index: 0,
        values: [10],
      },
      {
        index: 2,
        values: [30],
      },
    ]);
  });

  it("resolves identifiers case-insensitively end-to-end", () => {
    const sql = createTestPostgresSql();

    sql.createDatabase("DB1").execute();

    sql.useDatabase("DB1").execute();

    sql.createTable(...createTableTestSpec("Users", {
      UserId: {
        type: SQL_DECIMAL,
        nullable: false,
      },
    })).execute();

    sql
      .insertInto("Users", ["UserId"])
      .values([
        [1],
      ])
      .execute();

    const rows = sql
      .select([col("userid")])
      .from("users")
      .execute();

    expect(rows[0]).toEqual([
      {
        index: 0,
        values: [1],
      },
    ]);
  });

  it("produces deterministic execution results", () => {
    const sql = createTestPostgresSql();

    sql.createDatabase("DB1").execute();

    sql.useDatabase("DB1").execute();

    sql.createTable(...createTableTestSpec("Users", {
      Id: {
        type: SQL_DECIMAL,
        nullable: false,
      },
    })).execute();

    sql
      .insertInto("Users", ["Id"])
      .values([
        [1],
        [2],
      ])
      .execute();

    const first = sql
      .select("*")
      .from("Users")
      .execute();

    const second = sql
      .select("*")
      .from("Users")
      .execute();

    expect(first).toEqual(second);
  });

  it("does not mutate committed state during select execution", () => {
    const sql = createTestPostgresSql();

    sql.createDatabase("DB1").execute();

    sql.useDatabase("DB1").execute();

    sql.createTable(...createTableTestSpec("Users", {
      Id: {
        type: SQL_DECIMAL,
        nullable: false,
      },
    })).execute();

    sql
      .insertInto("Users", ["Id"])
      .values([
        [1],
      ])
      .execute();

    const before = sql
      .select("*")
      .from("Users")
      .execute();

    sql
      .select("*")
      .from("Users")
      .execute();

    const after = sql
      .select("*")
      .from("Users")
      .execute();

    expect(before).toEqual(after);
  });
});