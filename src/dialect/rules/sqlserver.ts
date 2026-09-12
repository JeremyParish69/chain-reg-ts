import { type DialectRules } from "../DialectRules.js";
import {
  CURRENT_TIMESTAMP,
  DEFAULT,
  GETDATE,
  type Keyword,
  type SqlFunctionKeyword,
  type TemporalExpressionKeyword,
} from "../keywords.js";

const SQLSERVER_FRAGMENTS: Record<string, string> = {
  createTable: "createTable",

  insertInto: "insertInto",
  values: "values",
  output: "returning",

  ///...
};

export const SQLSERVER_RULES: DialectRules = {
  fragments: SQLSERVER_FRAGMENTS,

  identifiers: {
    quote: `"`, // SQL Server allows double quotes if QUOTED_IDENTIFIER ON
    caseSensitive: false, // Default collation is case-insensitive
    maxLength: 128, // SQL Server max identifier length
  },

  ddl: {
    supportsIfExists: true, // DROP TABLE / DROP COLUMN ... IF EXISTS is supported in recent versions
    supportsDeferrableConstraints: false, // SQL Server does not support DEFERRABLE
    supportsInlineForeignKeys: true,
    ctasColumnListOverridesQueryColumns: false,
    ctasColumnListMustMatchQueryColumnCount: false,
    ctasAllowsConstraints: false,
  },

  constraints: {
    supportsNotValidatedConstraints: true,
    nullsDistinct: true,
    allowNullableForeignKeys: true,
    foreignKeyDefaultOnDelete: "restrict",
    foreignKeyDefaultOnUpdate: "restrict",
  },

  tablePolicy: {
    allowMultipleAutoIncrementColumns: false,
  },

  autoIncrementColumnPolicy: {
    autoIncrementNullGenerates: false,
    autoIncrementZeroGenerates: false,
    autoIncrementExplicitValueAdvances: true,
    autoIncrementAllowsExplicitValue: false,
    autoIncrementAllowsExplicitDefault: false,
  },

  insert: {
    supportsDefaultKeyword: true,
    supportsReturning: false, // INSERT ... OUTPUT is supported
    supportsOnConflict: false, // Postgres-only
    supportsOnDuplicateKey: false, // MySQL-only
    supportsIgnore: false, // INSERT IGNORE not supported
  },

  update: {
    supportsFrom: true, // UPDATE ... FROM is supported
    supportsLimit: false, // Must use TOP or OFFSET/FETCH
    supportsReturning: true, // Can use OUTPUT clause
  },

  delete: {
    supportsUsing: false, // DELETE ... USING not supported
    supportsLimit: false, // Use TOP or OFFSET/FETCH
    supportsReturning: true, // Can use OUTPUT clause
  },

  input: {
    keywords: new Set<Keyword>([DEFAULT]),

    temporalExpressions: new Set<TemporalExpressionKeyword>([
      CURRENT_TIMESTAMP,
    ]),

    sqlFunctions: new Set<SqlFunctionKeyword>([GETDATE]),
  },

  transaction: {
    autoCommit: true,
    isolationLevel: "READ COMMITTED",
  },
};
