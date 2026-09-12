import { type DialectRules } from "../DialectRules.js";
import {
  CURRENT_DATE,
  CURRENT_TIME,
  CURRENT_TIMESTAMP,
  DEFAULT,
  NOW,
  type Keyword,
  type SqlFunctionKeyword,
  type TemporalExpressionKeyword,
} from "../keywords.js";

export const POSTGRES_FRAGMENTS: Record<string, string> = {
  createTable: "createTable",

  as: "as",
  insertInto: "insertInto",
  values: "values",
  returning: "returning",

  ///...
};

export const POSTGRES_RULES: DialectRules = {
  fragments: POSTGRES_FRAGMENTS,

  identifiers: {
    quote: `"`,
    caseSensitive: true,
    maxLength: 63, // PostgreSQL identifier limit
  },

  ddl: {
    supportsIfExists: true,
    supportsDeferrableConstraints: true,
    supportsInlineForeignKeys: true,
    ctasColumnListOverridesQueryColumns: true,
    ctasColumnListMustMatchQueryColumnCount: true,
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
    allowMultipleAutoIncrementColumns: true,
  },

  autoIncrementColumnPolicy: {
    autoIncrementNullGenerates: false,
    autoIncrementZeroGenerates: false,
    autoIncrementExplicitValueAdvances: false,
    autoIncrementAllowsExplicitValue: true,
    autoIncrementAllowsExplicitDefault: true,
  },

  insert: {
    supportsDefaultKeyword: true,
    supportsReturning: true,
    supportsOnConflict: true,
    supportsOnDuplicateKey: false,
    supportsIgnore: false,
  },

  update: {
    supportsFrom: true,
    supportsLimit: false, // requires subquery
    supportsReturning: true,
  },

  delete: {
    supportsUsing: true,
    supportsLimit: false, // requires subquery
    supportsReturning: true,
  },

  input: {
    keywords: new Set<Keyword>([DEFAULT]),

    temporalExpressions: new Set<TemporalExpressionKeyword>([
      CURRENT_TIMESTAMP,
      CURRENT_DATE,
      CURRENT_TIME,
    ]),

    sqlFunctions: new Set<SqlFunctionKeyword>([NOW]),
  },

  transaction: {
    autoCommit: true,
    isolationLevel: "READ COMMITTED",
  },
};
