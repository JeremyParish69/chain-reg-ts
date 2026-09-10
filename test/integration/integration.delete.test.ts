import { describe, it, expect } from 'vitest';
import { CONSTRAINT_KIND } from '../../src/relational/ConstraintKind.js';
import { createTestPostgresSql } from '../utils/engineHelpers.js';
import { col } from '../../src/ast/dsl.js';
import { SQL_DECIMAL, SQL_VARCHAR } from '../../src/types/SqlType.js';
import { createTableTestSpec } from '../utils/buildSchema.js';

describe("Integration::delete", () => {
  it("deletes a single row", () => {
    const sql = createTestPostgresSql();

    sql.createDatabase("DB1").execute();

    sql.useDatabase("DB1").execute();

    sql.createTable(...createTableTestSpec("Users", {
      Id: {
        type: SQL_DECIMAL,
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
      .values([[1, "Alice"], [2, "Bob"]])
      .execute();

    sql
      .deleteFrom("Users")
      .where(
        col("Id").eq(1)
      )
      .execute();

    const rows = sql
      .select("*")
      .from("Users")
      .execute();

    expect(rows).toEqual([[
      {
        "index": 1,
        "values": [2, "Bob"],
      },
    ]]);
  });

  it("deletes all rows when no WHERE clause is specified", () => {
    const sql = createTestPostgresSql();

    sql.createDatabase("DB1").execute();
    sql.useDatabase("DB1").execute();

    sql.createTable(...createTableTestSpec("Users", {
      Id: {
        type: SQL_DECIMAL,
        nullable: false,
        primaryKey: true,
      },
    })).execute();

    sql
      .insertInto("Users", ["Id"])
      .values([[1], [2], [3]])
      .execute();

    sql
      .deleteFrom("Users")
      .execute();

    const rows = sql
      .select("*")
      .from("Users")
      .execute();

    expect(rows).toEqual([[]]);
  });

  it("deletes multiple rows matching a predicate", () => {
    const sql = createTestPostgresSql();

    sql.createDatabase("DB1").execute();
    sql.useDatabase("DB1").execute();

    sql.createTable(...createTableTestSpec("Users", {
      Id: {
        type: SQL_DECIMAL,
        nullable: false,
        primaryKey: true,
      },
    })).execute();

    sql
      .insertInto("Users", ["Id"])
      .values([[1], [2], [3]])
      .execute();

    sql
      .deleteFrom("Users")
      .where(
        col("Id").gt(1)
      )
      .execute();

    const rows = sql
      .select("*")
      .from("Users")
      .execute();

    expect(rows).toEqual([[
      {
        index: 0,
        values: [1],
      },
    ]]);
  });

  it("prevents deleting a parent row referenced by a child", () => {
    const sql = createTestPostgresSql();

    sql.createDatabase("DB1").execute();
    sql.useDatabase("DB1").execute();

    sql.createTable(...createTableTestSpec("Roles", {
      Id: {
        type: SQL_DECIMAL,
        nullable: false,
        primaryKey: true,
      },
    })).execute();

    sql.createTable(...createTableTestSpec("Users",
      {
        RoleId: {
          type: SQL_DECIMAL,
          nullable: false,
        }
      },
      {
        role_fk: {
          kind: CONSTRAINT_KIND.foreignKey,
          name: "role_fk",
          columns: ["RoleId"],
          parentTable: "Roles",
          parentColumns: ["Id"],
          onDelete: "restrict",
        },
      }
    )).execute();

    sql
      .insertInto("Roles", ["Id"])
      .values([[1]])
      .execute();

    sql
      .insertInto("Users", ["RoleId"])
      .values([[1]])
      .execute();

    expect(() =>
      sql
        .deleteFrom("Roles")
        .where(
          col("Id").eq(1)
        )
        .execute()
    ).toThrow();
  });

  it("cascades deletes to child rows", () => {
    const sql = createTestPostgresSql();

    sql.createDatabase("DB1").execute();
    sql.useDatabase("DB1").execute();

    sql.createTable(...createTableTestSpec("Roles", {
      Id: {
        type: SQL_DECIMAL,
        nullable: false,
        primaryKey: true,
      },
    })).execute();

    sql.createTable(...createTableTestSpec("Users",
      {
        RoleId: {
          type: SQL_DECIMAL,
          nullable: false,
        }
      },
      {
        role_fk: {
          kind: CONSTRAINT_KIND.foreignKey,
          name: "role_fk",
          columns: ["RoleId"],
          parentTable: "Roles",
          parentColumns: ["Id"],
          onDelete: "cascade",
        },
      }
    )).execute();

    sql
      .insertInto("Roles", ["Id"])
      .values([[1]])
      .execute();

    sql
      .insertInto("Users", ["RoleId"])
      .values([[1]])
      .execute();

    sql
      .deleteFrom("Roles")
      .where(
        col("Id").eq(1)
      )
      .execute();

    const roles = sql
      .select("*")
      .from("Roles")
      .execute();

    const users = sql
      .select("*")
      .from("Users")
      .execute();

    expect(roles).toEqual([[]]);
    expect(users).toEqual([[]]);
  });
});