import { describe, it, expect } from 'vitest';
import { createTestPostgresSql, freshEngine } from '../utils/engineHelpers.ts';
import { SQL_INTEGER, SQL_VARCHAR } from '../../src/types/SqlType.ts';

describe("Integration::alter", () => {
  it("adds multiple columns in a single ALTER TABLE ADD", () => {
    const engine = freshEngine();
    const sql = createTestPostgresSql(engine);

    sql.createDatabase("DB1").execute();
    sql.useDatabase("DB1").execute();

    sql.createTable("Users", [
      {
        name: "Id",
        type: SQL_INTEGER,
        nullable: false,
      },
    ]).execute();

    sql.alterTable("Users").add([
      {
        name: "Age",
        type: SQL_INTEGER,
        nullable: true,
      },
      {
        name: "Name",
        type: SQL_VARCHAR,
        nullable: true,
      },
    ]).execute();

    const result = sql.select("*").from("Users").execute();

    expect(result).toEqual([[]]);
  });
});