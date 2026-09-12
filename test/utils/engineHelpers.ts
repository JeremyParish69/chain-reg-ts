import { EngineRegistry } from "../../src/engine/index.js";
import { Dialect } from "../../src/dialect/index.js";
import type { Engine } from "../../src/engine/Engine.ts";
import type { PostgresInputBatch } from "../../src/input/PostgresInputBatch.ts";
import type { SqlServerInputBatch } from "../../src/input/SqlServerInputBatch.ts";
import type { MySqlInputBatch } from "../../src/input/MySqlInputBatch.ts";

let engineId = 0;

export function freshEngine(dialect?: Dialect) {
  const registry = EngineRegistry.getInstance();
  const name = `E_${engineId++}`;

  registry.newEngine(name, dialect ?? Dialect.Postgres);
  registry.setDefaultEngine(name);

  return registry.engine();
}

export function createTestSql(engine?: Engine) {
  return (engine ?? freshEngine()).input();
}

export function createTestPostgresSql(
  engine?: Engine,
): PostgresInputBatch {
  if (engine && engine.dialect !== Dialect.Postgres) {
    throw new Error(`Cannot create Batch with mismatching Engine: (${engine.dialect})`);
  }
  return (engine ?? freshEngine(Dialect.Postgres))
    .input() as PostgresInputBatch;
}

export function createTestSqlServerSql(
  engine?: Engine,
): SqlServerInputBatch {
  if (engine && engine.dialect !== Dialect.SQLServer) {
    throw new Error(`Cannot create Batch with mismatching Engine: (${engine.dialect})`);
  }
  return (engine ?? freshEngine(Dialect.SQLServer))
    .input() as SqlServerInputBatch;
}

export function createTestMySqlSql(
  engine?: Engine,
): MySqlInputBatch {
  if (engine && engine.dialect !== Dialect.MySQL) {
    throw new Error(`Cannot create Batch with mismatching Engine: (${engine.dialect})`);
  }
  return (engine ?? freshEngine(Dialect.MySQL))
    .input() as MySqlInputBatch;
}