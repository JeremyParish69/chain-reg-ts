import { describe, it, expect } from 'vitest';
import { createTestPostgresSql } from '../utils/engineHelpers.ts';
import { case_, col } from '../../src/ast/dsl.ts';
import { SQL_DECIMAL, SQL_VARCHAR } from '../../src/types/SqlType.ts';
import { createTableTestSpec } from '../utils/buildSchema.ts';

describe("Integration::update", () => {
  it("updates a single row", () => {
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
      .values([[1, "Alice"]])
      .execute();

    sql
      .update("Users")
      .set({
        Name: "Bob",
      })
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
        "index": 0,
        "values": [1, "Bob"],
      },
    ]]);
  });

  it("updates all rows matching a predicate", () => {
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
      .values([
        [1, "Alice"],
        [2, "Bob"],
        [3, "Charlie"],
      ])
      .execute();

    sql
      .update("Users")
      .set({
        Name: "Updated",
      })
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
        values: [1, "Alice"],
      },
      {
        index: 1,
        values: [2, "Updated"],
      },
      {
        index: 2,
        values: [3, "Updated"],
      },
    ]]);
  });

  it("rejects updates that create duplicate primary keys", () => {
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
      .values([
        [1, "Alice"],
        [2, "Bob"],
      ])
      .execute();

    expect(() => {
      sql
        .update("Users")
        .set({
          Id: 2,
        })
        .where(
          col("Id").eq(1)
        )
        .execute();
    }).toThrow();
  });

  it("rejects updates that violate unique constraints", () => {
    const sql = createTestPostgresSql();

    sql.createDatabase("DB1").execute();
    sql.useDatabase("DB1").execute();

    sql.createTable(...createTableTestSpec("Users", {
      Id: {
        type: SQL_DECIMAL,
        nullable: false,
        primaryKey: true,
      },
      Email: {
        type: SQL_VARCHAR,
        nullable: false,
        unique: true,
      },
    })).execute();

    sql
      .insertInto("Users", ["Id", "Email"])
      .values([
        [1, "alice@test.com"],
        [2, "bob@test.com"],
      ])
      .execute();

    expect(() => {
      sql
        .update("Users")
        .set({
          Email: "bob@test.com",
        })
        .where(
          col("Id").eq(1)
        )
        .execute();
    }).toThrow();
  });

  it("rejects updates with missing foreign key parents", () => {
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

    sql.createTable(...createTableTestSpec("Posts", {
      Id: {
        type: SQL_DECIMAL,
        nullable: false,
        primaryKey: true,
      },
      UserId: {
        type: SQL_DECIMAL,
        nullable: false,
      },
    })).execute();

    sql.alterTable("Posts")
      .addConstraint("Posts_FK")
      .foreignKey(["UserId"])
      .references("Users", ["Id"])
      .execute();

    sql
      .insertInto("Users", ["Id"])
      .values([[1]])
      .execute();

    sql
      .insertInto("Posts", ["Id", "UserId"])
      .values([[1, 1]])
      .execute();

    expect(() => {
      sql
        .update("Posts")
        .set({
          UserId: 999,
        })
        .where(
          col("Id").eq(1)
        )
        .execute();
    }).toThrow();
  });

  it("cascades foreign key updates", () => {
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

    sql.createTable(...createTableTestSpec("Posts", {
      Id: {
        type: SQL_DECIMAL,
        nullable: false,
        primaryKey: true,
      },
      UserId: {
        type: SQL_DECIMAL,
        nullable: false,
      },
    })).execute();

    sql.alterTable("Posts")
      .addConstraint("Posts_FK")
      .foreignKey(["UserId"])
      .references("Users", ["Id"])
      .onUpdate("cascade")
      .execute();

    sql
      .insertInto("Users", ["Id"])
      .values([[1]])
      .execute();

    sql
      .insertInto("Posts", ["Id", "UserId"])
      .values([[1, 1]])
      .execute();

    sql
      .update("Users")
      .set({
        Id: 2,
      })
      .where(
        col("Id").eq(1)
      )
      .execute();

    const rows = sql
      .select("*")
      .from("Posts")
      .execute();

    expect(rows).toEqual([[
      {
        index: 0,
        values: [1, 2],
      },
    ]]);
  });

  it("updates PKs atomically using CASE expression", () => {
    const sql = createTestPostgresSql();

    sql.createDatabase("DB1").execute();
    sql.useDatabase("DB1").execute();

    sql.createTable(...createTableTestSpec("Users", {
      Id: { type: SQL_DECIMAL, nullable: false, primaryKey: true },
      Name: { type: SQL_VARCHAR },
    })).execute();

    sql
      .insertInto("Users", ["Id", "Name"])
      .values([
        [1, "A"],
        [2, "B"],
      ])
      .execute();

    sql
      .update("Users")
      .set({
        Id: case_()
          .when(col("Id").eq(1)).then(2)
          .when(col("Id").eq(2)).then(1)
          .else(col("Id")),
      })
      .execute();

    const rows = sql.select("*").from("Users").execute();

    expect(rows).toEqual([[
      { index: 0, values: [2, "A"] },
      { index: 1, values: [1, "B"] },
    ]]);
  });

  it("updates using arithmetic expressions", () => {
    const sql = createTestPostgresSql();

    sql.createDatabase("DB1").execute();
    sql.useDatabase("DB1").execute();

    sql.createTable(...createTableTestSpec("Users", {
      Id: { type: SQL_DECIMAL, nullable: false, primaryKey: true },
      Name: { type: SQL_VARCHAR },
    })).execute();

    sql
      .insertInto("Users", ["Id", "Name"])
      .values([
        [1, "A"],
        [2, "B"],
      ])
      .execute();

    sql
    .update("Users")
    .set({
      Id: col("Id").add(1),
    })
    .execute();

    const rows = sql.select("*").from("Users").execute();

    expect(rows).toEqual([[
      { index: 0, values: [2, "A"] },
      { index: 1, values: [3, "B"] },
    ]]);
  });

  it('rejects inserts violating checks', () => {
  
    const sql = createTestPostgresSql();

    sql.createDatabase("DB1").execute();

    sql.useDatabase("DB1").execute();

    sql.createTable(...createTableTestSpec("Users", {
      Age: {
        type: SQL_DECIMAL,
        nullable: false,
      },
    })).execute();

    sql.alterTable("Users")
      .addConstraint("CHK_Adult")
      .check(
        col("Age").gte(18)
      )
      .execute();

    sql
      .insertInto("Users", ["Age"])
      .values([
        [20]
      ])
      .execute();

    expect(() => {
      sql
        .update("Users")
        .set({
          Age: 10
        })
        .execute();
    }).toThrow();
  });

  it('allows updates satisfying checks', () => {

    const sql = createTestPostgresSql();

    sql.createDatabase("DB1").execute();

    sql.useDatabase("DB1").execute();

    sql.createTable(...createTableTestSpec("Users", {
      Age: {
        type: SQL_DECIMAL,
        nullable: false,
      },
    })).execute();

    sql.alterTable("Users")
      .addConstraint("CHK_Adult")
      .check(
        col("Age").gte(18)
      )
      .execute();

    sql
      .insertInto("Users", ["Age"])
      .values([
        [20]
      ])
      .execute();

    expect(() => {
      sql
        .update("Users")
        .set({
          Age: 22
        })
        .execute();
    }).not.toThrow();
  });

  it('rejects entire update when one row violates a check', () => {
    const sql = createTestPostgresSql();

    sql.createDatabase("DB1").execute();

    sql.useDatabase("DB1").execute();

    sql.createTable(...createTableTestSpec("Users", {
      Age: {
        type: SQL_DECIMAL,
        nullable: false,
      },
    })).execute();

    sql.alterTable("Users")
      .addConstraint("CHK_Adult")
      .check(
        col("Age").gte(18)
      )
      .execute();

    sql
      .insertInto("Users", ["Age"])
      .values([
        [20], [30]
      ])
      .execute();

    expect(() => {
      sql
        .update("Users")
        .set({
          Age: col("Age").subtract(10)
        })
        .execute();
    }).toThrow();

    const users =
      sql.select("*")
        .from("Users")
        .execute();

    expect(users).toEqual([[
      {
        "index": 0,
        "values": [20],
      },
      {
        "index": 1,
        "values": [30],
      },
    ]]);
  });

  it("uses an explicit DEFAULT value", () => {
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
        defaultValue: "Anonymous",
      },
    })).execute();

    sql
      .insertInto("Users", ["Id", "Name"])
      .values([[1, "Alice"]])
      .execute();

    sql
      .update("Users")
      .set({
        Name: sql.DEFAULT,
      })
      .where(
        col("Id").eq(1),
      )
      .execute();

    const rows = sql
      .select("*")
      .from("Users")
      .execute();

    expect(rows).toEqual([[
      {
        index: 0,
        values: [1, "Anonymous"],
      },
    ]]);
  });

  it("uses NULL for DEFAULT on a nullable column without a default", () => {
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
        nullable: true,
      },
    })).execute();

    sql
      .insertInto("Users", ["Id", "Name"])
      .values([[1, "Alice"]])
      .execute();

    sql
      .update("Users")
      .set({
        Name: sql.DEFAULT,
      })
      .where(
        col("Id").eq(1),
      )
      .execute();

    const rows = sql
      .select("*")
      .from("Users")
      .execute();

    expect(rows).toEqual([[
      {
        index: 0,
        values: [1, null],
      },
    ]]);
  });

  it("rejects DEFAULT on a non-nullable column without a default", () => {
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
      .values([[1, "Alice"]])
      .execute();

    expect(() => {
      sql
        .update("Users")
        .set({
          Name: sql.DEFAULT,
        })
        .where(
          col("Id").eq(1),
        )
        .execute();
    }).toThrow(/Cannot resolve default.*Name/);
  });

  it("uses CURRENT_TIMESTAMP in an update expression", () => {
    const sql = createTestPostgresSql();

    sql.createDatabase("DB1").execute();
    sql.useDatabase("DB1").execute();

    sql.createTable(...createTableTestSpec("Users", {
      Id: {
        type: SQL_DECIMAL,
        nullable: false,
        primaryKey: true,
      },
      UpdatedAt: {
        type: SQL_VARCHAR,
        nullable: true,
      },
    })).execute();

    sql
      .insertInto("Users", ["Id", "UpdatedAt"])
      .values([[1, null]])
      .execute();

    const before = Date.now();

    sql
      .update("Users")
      .set({
        UpdatedAt: sql.CURRENT_TIMESTAMP,
      })
      .where(
        col("Id").eq(1),
      )
      .execute();

    const after = Date.now();

    const rows = sql
      .select("*")
      .from("Users")
      .execute();

    const value = rows[0][0].values[1];

    expect(typeof value).toBe("string");

    const timestamp = Date.parse(value as string);

    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });

  it("uses NOW in an update expression", () => {
    const sql = createTestPostgresSql();

    sql.createDatabase("DB1").execute();
    sql.useDatabase("DB1").execute();

    sql.createTable(...createTableTestSpec("Users", {
      Id: {
        type: SQL_DECIMAL,
        nullable: false,
        primaryKey: true,
      },
      UpdatedAt: {
        type: SQL_VARCHAR,
        nullable: false,
      },
    })).execute();

    sql
      .insertInto("Users", ["Id", "UpdatedAt"])
      .values([[1, "initial"]])
      .execute();

    sql
      .update("Users")
      .set({
        UpdatedAt: sql.NOW(),
      })
      .where(
        col("Id").eq(1),
      )
      .execute();

    const rows = sql
      .select("*")
      .from("Users")
      .execute();

    const value = rows[0][0].values[1];

    expect(typeof value).toBe("string");
    expect(Number.isNaN(Date.parse(value as string))).toBe(false);
  });
});