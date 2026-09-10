import { describe, it, expect } from 'vitest';
import { createTestMySqlSql, createTestPostgresSql, freshEngine } from '../utils/engineHelpers.ts';
import { SQL_INTEGER, SQL_VARCHAR } from '../../src/types/SqlType.ts';
import { col, selectAs } from '../../src/ast/dsl.ts';
import { Dialect } from '../../src/dialect/Dialect.ts';
import { createTableTestSpec } from '../utils/buildSchema.ts';

describe("Integration::create", () => {
  describe("CTAS", () => {
    it("creates a table from a SELECT query", () => {
      const engine = freshEngine();
      const sql = createTestPostgresSql(engine);

      sql.createDatabase("DB1").execute();
      sql.useDatabase("DB1").execute();

      sql
        .createTable(...createTableTestSpec("Users", {
          Id: {
            type: SQL_INTEGER,
            nullable: false,
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
          [1, "Alice"],
          [2, "Bob"],
        ])
        .execute();

      sql
        .createTable(...createTableTestSpec("ActiveUsers"))
        .as(
          sql
            .select([col("Id"), col("Name")])
            .from("Users")
            .asQueryStatement(),
        )
        .execute();

      const result = sql
        .select([col("Id"), col("Name")])
        .from("ActiveUsers")
        .execute();

      expect(result).toEqual([[
        {
          "index": 0,
          "values": [1, "Alice"],
        },
        {
          "index": 1,
          "values": [2, "Bob"],
        }
      ]]);
    });

    it("creates a table using explicitly defined columns", () => {
      const engine = freshEngine();
      const sql = createTestPostgresSql(engine);

      sql.createDatabase("DB1").execute();
      sql.useDatabase("DB1").execute();

      sql
        .createTable(...createTableTestSpec("Users", {
          Id: {
            type: SQL_INTEGER,
            nullable: false,
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
          [1, "Alice"],
          [2, "Bob"],
        ])
        .execute();

      sql
        .createTable(...createTableTestSpec("UsersCopy", {
          Id: {
            type: SQL_INTEGER,
            nullable: false,
          },
          Name: {
            type: SQL_VARCHAR,
            nullable: false,
          },
        }))
        .as(
          sql
            .select([col("Id"), col("Name")])
            .from("Users")
            .asQueryStatement(),
        )
        .execute();

      const result = sql
        .select([col("Id"), col("Name")])
        .from("UsersCopy")
        .execute();

      expect(result).toEqual([[
        {
          index: 0,
          values: [1, "Alice"],
        },
        {
          index: 1,
          values: [2, "Bob"],
        },
      ]]);
    });

    it("uses query aliases as destination column names", () => {
      const engine = freshEngine();
      const sql = createTestPostgresSql(engine);

      sql.createDatabase("DB1").execute();
      sql.useDatabase("DB1").execute();

      sql
        .createTable(...createTableTestSpec("Users", {
          Id: {
            type: SQL_INTEGER,
            nullable: false,
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
          [1, "Alice"],
          [2, "Bob"],
        ])
        .execute();

      sql
        .createTable(...createTableTestSpec("UsersCopy"))
        .as(
          sql
            .select([
              selectAs(col("Id"), "UserId"),
              selectAs(col("Name"), "DisplayName"),
            ])
            .from("Users")
            .asQueryStatement(),
        )
        .execute();

      const result = sql
        .select([col("UserId"), col("DisplayName")])
        .from("UsersCopy")
        .execute();

      expect(result).toEqual([[
        {
          index: 0,
          values: [1, "Alice"],
        },
        {
          index: 1,
          values: [2, "Bob"],
        },
      ]]);
    });

    it("rejects a CTAS column list whose count does not match the query", () => {
      const engine = freshEngine();
      const sql = createTestPostgresSql(engine);

      sql.createDatabase("DB1").execute();
      sql.useDatabase("DB1").execute();

      sql
        .createTable(...createTableTestSpec("Users", {
          Id: {
            type: SQL_INTEGER,
            nullable: false,
          },
          Name: {
            type: SQL_VARCHAR,
            nullable: false,
          },
        }))
        .execute();

      expect(() => {
        sql
          .createTable(...createTableTestSpec("UsersCopy", {
            Id: {
              type: SQL_INTEGER,
              nullable: false,
            },
          }))
          .as(
            sql
              .select([col("Id"), col("Name")])
              .from("Users")
              .asQueryStatement(),
          )
          .execute();
      }).toThrow(
        "CTAS column list count does not match query column count",
      );
    });

    it("accepts a CTAS column list whose count matches the query", () => {
      const engine = freshEngine();
      const sql = createTestPostgresSql(engine);

      sql.createDatabase("DB1").execute();
      sql.useDatabase("DB1").execute();

      sql
        .createTable(...createTableTestSpec("Users", {
          Id: {
            type: SQL_INTEGER,
            nullable: false,
          },
          Name: {
            type: SQL_VARCHAR,
            nullable: false,
          },
        }))
        .execute();

      sql
        .createTable(...createTableTestSpec("UsersCopy", {
          UserId: {
            type: SQL_INTEGER,
            nullable: false,
          },
          DisplayName: {
            type: SQL_VARCHAR,
            nullable: false,
          },
        }))
        .as(
          sql
            .select([col("Id"), col("Name")])
            .from("Users")
            .asQueryStatement(),
        )
        .execute();

      const result = sql
        .select([col("UserId"), col("DisplayName")])
        .from("UsersCopy")
        .execute();

      expect(result).toEqual([[]]);
    });

    it("rejects a CTAS column list whose count does not match the query", () => {
      const engine = freshEngine();
      const sql = createTestPostgresSql(engine);

      sql.createDatabase("DB1").execute();
      sql.useDatabase("DB1").execute();

      sql
        .createTable(...createTableTestSpec("Users", {
          Id: {
            type: SQL_INTEGER,
            nullable: false,
          },
          Name: {
            type: SQL_VARCHAR,
            nullable: false,
          },
        }))
        .execute();

      expect(() => {
        sql
          .createTable(...createTableTestSpec("UsersCopy", {
            Id: {
              type: SQL_INTEGER,
              nullable: false,
            },
          }))
          .as(
            sql
              .select([col("Id"), col("Name")])
              .from("Users")
              .asQueryStatement(),
          )
          .execute();
      }).toThrow(
        "CTAS column list count does not match query column count",
      );
    });

    it("allows a CTAS column list whose count does not match the query", () => {
      const engine = freshEngine(Dialect.MySQL);
      const sql = createTestMySqlSql(engine);

      sql.createDatabase("DB1").execute();
      sql.useDatabase("DB1").execute();

      sql
        .createTable(...createTableTestSpec("Users", {
          Id: {
            type: SQL_INTEGER,
            nullable: false,
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
          [1, "Alice"],
          [2, "Bob"],
        ])
        .execute();

      sql
        .createTable(...createTableTestSpec("UsersCopy", [
          {
            name: "Id",
            type: SQL_INTEGER,
            nullable: false,
          },
        ]))
        .as(
          sql
            .select([col("Id"), col("Name")])
            .from("Users")
            .asQueryStatement(),
        )
        .execute();


      const result = sql
        .select("*")
        .from("UsersCopy")
        .execute();

      expect(result).toEqual([[
        {
          index: 0,
          values: [1, "Alice"],
        },
        {
          index: 1,
          values: [2, "Bob"],
        },
      ]]);
    });

    it("uses query aliases as destination column names", () => {
      const engine = freshEngine();
      const sql = createTestPostgresSql(engine);

      sql.createDatabase("DB1").execute();
      sql.useDatabase("DB1").execute();

      sql
        .createTable(...createTableTestSpec("Users", {
          Id: {
            type: SQL_INTEGER,
            nullable: false,
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
          [1, "Alice"],
          [2, "Bob"],
        ])
        .execute();

      sql
        .createTable(...createTableTestSpec("UsersCopy"))
        .as(
          sql
            .select([
              selectAs(col("Id"), "UserId"),
              selectAs(col("Name"), "DisplayName"),
            ])
            .from("Users")
            .asQueryStatement(),
        )
        .execute();

      const result = sql
        .select([col("UserId"), col("DisplayName")])
        .from("UsersCopy")
        .execute();

      expect(result).toEqual([[
        {
          index: 0,
          values: [1, "Alice"],
        },
        {
          index: 1,
          values: [2, "Bob"],
        },
      ]]);
    });

    it("uses a CTAS column list positionally", () => {
      const engine = freshEngine();
      const sql = createTestPostgresSql(engine);

      sql.createDatabase("DB1").execute();
      sql.useDatabase("DB1").execute();

      sql
        .createTable("Users", [
          {
            name: "Id",
            type: SQL_INTEGER,
            nullable: false,
          },
          {
            name: "Name",
            type: SQL_VARCHAR,
            nullable: false,
          },
        ])
        .execute();

      sql
        .insertInto("Users", ["Id", "Name"])
        .values([
          [1, "Alice"],
          [2, "Bob"],
        ])
        .execute();

      sql
        .createTable("UsersCopy", [
          {
            name: "UserId",
            type: SQL_INTEGER,
            nullable: false,
          },
          {
            name: "DisplayName",
            type: SQL_VARCHAR,
            nullable: false,
          },
        ])
        .as(
          sql
            .select([col("Id"), col("Name")])
            .from("Users")
            .asQueryStatement(),
        )
        .execute();

      const result = sql
        .select([col("UserId"), col("DisplayName")])
        .from("UsersCopy")
        .execute();

      expect(result).toEqual([[
        {
          index: 0,
          values: [1, "Alice"],
        },
        {
          index: 1,
          values: [2, "Bob"],
        },
      ]]);
    });

    it("uses explicit column metadata over query metadata", () => {
      const engine = freshEngine();
      const sql = createTestPostgresSql(engine);

      sql.createDatabase("DB1").execute();
      sql.useDatabase("DB1").execute();

      sql
        .createTable("Users", [
          {
            name: "Id",
            type: SQL_INTEGER,
            nullable: true,
          },
          {
            name: "Name",
            type: SQL_VARCHAR,
            nullable: true,
          },
        ])
        .execute();

      sql
        .insertInto("Users", ["Id", "Name"])
        .values([
          [1, "Alice"],
          [2, "Bob"],
        ])
        .execute();

      sql
        .createTable("UsersCopy", [
          {
            name: "Id",
            type: SQL_INTEGER,
            nullable: false,
          },
          {
            name: "Name",
            type: SQL_VARCHAR,
            nullable: false,
          },
        ])
        .as(
          sql
            .select([col("Id"), col("Name")])
            .from("Users")
            .asQueryStatement(),
        )
        .execute();

      const result = sql
        .select([col("Id"), col("Name")])
        .from("UsersCopy")
        .execute();

      expect(result).toEqual([[
        {
          index: 0,
          values: [1, "Alice"],
        },
        {
          index: 1,
          values: [2, "Bob"],
        },
      ]]);
    });

    it("creates the table when the query produces no rows", () => {
      const engine = freshEngine();
      const sql = createTestPostgresSql(engine);

      sql.createDatabase("DB1").execute();
      sql.useDatabase("DB1").execute();

      sql
        .createTable("Users", [
          {
            name: "Id",
            type: SQL_INTEGER,
            nullable: false,
          },
          {
            name: "Name",
            type: SQL_VARCHAR,
            nullable: false,
          },
        ])
        .execute();

      sql
        .createTable("UsersCopy")
        .as(
          sql
            .select([col("Id"), col("Name")])
            .from("Users")
            .asQueryStatement(),
        )
        .execute();

      const result = sql
        .select("*")
        .from("UsersCopy")
        .execute();

      expect(result).toEqual([[]]);
    });

    it("uses the column list order as the destination column order", () => {
      const engine = freshEngine();
      const sql = createTestPostgresSql(engine);

      sql.createDatabase("DB1").execute();
      sql.useDatabase("DB1").execute();

      sql
        .createTable("Users", [
          {
            name: "Id",
            type: SQL_INTEGER,
            nullable: false,
          },
          {
            name: "Name",
            type: SQL_VARCHAR,
            nullable: false,
          },
        ])
        .execute();

      sql
        .insertInto("Users", ["Id", "Name"])
        .values([
          [1, "Alice"],
          [2, "Bob"],
        ])
        .execute();

      sql
        .createTable("UsersCopy", [
          {
            name: "DisplayName",
            type: SQL_VARCHAR,
            nullable: false,
          },
          {
            name: "UserId",
            type: SQL_INTEGER,
            nullable: false,
          },
        ])
        .as(
          sql
            .select([col("Name"), col("Id")])
            .from("Users")
            .asQueryStatement(),
        )
        .execute();

      const result = sql
        .select("*")
        .from("UsersCopy")
        .execute();

      expect(result).toEqual([[
        {
          index: 0,
          values: ["Alice", 1],
        },
        {
          index: 1,
          values: ["Bob", 2],
        },
      ]]);
    });

    it("uses explicit column names over query aliases", () => {
      const engine = freshEngine();
      const sql = createTestPostgresSql(engine);

      sql.createDatabase("DB1").execute();
      sql.useDatabase("DB1").execute();

      sql
        .createTable("Users", [
          {
            name: "Id",
            type: SQL_INTEGER,
            nullable: false,
          },
          {
            name: "Name",
            type: SQL_VARCHAR,
            nullable: false,
          },
        ])
        .execute();

      sql
        .insertInto("Users", ["Id", "Name"])
        .values([
          [1, "Alice"],
          [2, "Bob"],
        ])
        .execute();

      sql
        .createTable("UsersCopy", [
          {
            name: "UserId",
            type: SQL_INTEGER,
            nullable: false,
          },
          {
            name: "DisplayName",
            type: SQL_VARCHAR,
            nullable: false,
          },
        ])
        .as(
          sql
            .select([
              selectAs(col("Id"), "QueryId"),
              selectAs(col("Name"), "QueryName"),
            ])
            .from("Users")
            .asQueryStatement(),
        )
        .execute();

      const result = sql
        .select([col("UserId"), col("DisplayName")])
        .from("UsersCopy")
        .execute();

      expect(result).toEqual([[
        {
          index: 0,
          values: [1, "Alice"],
        },
        {
          index: 1,
          values: [2, "Bob"],
        },
      ]]);
    });
  });
});