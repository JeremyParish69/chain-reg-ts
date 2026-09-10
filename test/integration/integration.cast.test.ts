import { describe, it, expect } from 'vitest';
import { createTestPostgresSql } from '../utils/engineHelpers.ts';
import { SQL_INTEGER, SQL_VARCHAR } from '../../src/types/SqlType.ts';
import { cast, col } from '../../src/ast/dsl.ts';
import { createTableTestSpec } from '../utils/buildSchema.ts';

describe("Integration::cast", () => {
  it("casts an INSERT value to the target SQL type", () => {
    const sql = createTestPostgresSql();

    sql.createDatabase("DB1").execute();
    sql.useDatabase("DB1").execute();

    sql.createTable(...createTableTestSpec("Users", {
      Id: {
        type: SQL_INTEGER,
        nullable: false,
        primaryKey: true,
      },
      Name: {
        type: SQL_VARCHAR,
        nullable: false,
      },
    }))
    .execute();

    sql
      .insertInto("Users", ["Id", "Name"])
      .values([
        [
          1,
          cast(123).as(SQL_VARCHAR),
        ],
      ])
      .execute();

    const rows = sql
      .select("*")
      .from("Users")
      .execute();

    expect(rows).toEqual([[
      {
        index: 0,
        values: [1, "123"],
      },
    ]]);
  });

  it("casts a column value during UPDATE", () => {
    const sql = createTestPostgresSql();

    sql.createDatabase("DB1").execute();
    sql.useDatabase("DB1").execute();

    sql.createTable(...createTableTestSpec("Users", {
      Id: {
        type: SQL_INTEGER,
        nullable: false,
        primaryKey: true,
      },
      Name: {
        type: SQL_VARCHAR,
        nullable: false,
      },
    })).execute();

    sql
      .insertInto("Users", ["Id", "Name"])
      .values([[123, "Alice"]])
      .execute();

    sql
      .update("Users")
      .set({
        Name: cast(col("Id")).as(SQL_VARCHAR),
      })
      .where(col("Id").eq(123))
      .execute();

    const rows = sql
      .select("*")
      .from("Users")
      .execute();

    expect(rows).toEqual([[
      {
        index: 0,
        values: [123, "123"],
      },
    ]]);
  });

  it("evaluates CAST inside a WHERE predicate", () => {
    const sql = createTestPostgresSql();

    sql.createDatabase("DB1").execute();
    sql.useDatabase("DB1").execute();

    sql.createTable(...createTableTestSpec("Users", {
      Id: {
        type: SQL_INTEGER,
        nullable: false,
        primaryKey: true,
      },
      Name: {
        type: SQL_VARCHAR,
        nullable: false,
      },
    })).execute();

    sql
      .insertInto("Users", ["Id", "Name"])
      .values([
        [123, "123"],
        [456, "456"],
      ])
      .execute();

    sql
      .update("Users")
      .set({
        Name: "matched",
      })
      .where(
        cast(col("Id")).as(SQL_VARCHAR).eq("123"),
      )
      .execute();

    const rows = sql
      .select("*")
      .from("Users")
      .execute();

    expect(rows).toEqual([[
      {
        index: 0,
        values: [123, "matched"],
      },
      {
        index: 1,
        values: [456, "456"],
      },
    ]]);
  });

  it("rejects a CAST that is incompatible with a known column type", () => {
    const sql = createTestPostgresSql();

    sql.createDatabase("DB1").execute();
    sql.useDatabase("DB1").execute();

    sql.createTable(...createTableTestSpec("Users", {
      Id: {
        type: SQL_INTEGER,
        nullable: false,
        primaryKey: true,
      },
      Name: {
        type: SQL_VARCHAR,
        nullable: false,
      },
    })).execute();

    sql
      .insertInto("Users", ["Id", "Name"])
      .values([[1, "Alice"]])
      .execute();

    expect(() => {
      sql
        .update("Users")
        .set({
          Id: cast(col("Name")).as(SQL_INTEGER),
        })
        .execute();
    }).toThrow();
  });
});