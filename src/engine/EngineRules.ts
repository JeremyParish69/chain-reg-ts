import {
  CURRENT_TIMESTAMP,
  DEFAULT,
  Dialect,
  DIALECT_RULES,
  NOW,
  type Keyword,
  type SqlFunctionKeyword,
  type TemporalExpressionKeyword,
} from "../dialect/index.js";

export interface EngineRuleSpec<T> {
  engineDefault: T; // fallback default
  dialectDefault?: (d: Dialect) => T | undefined; // returns undefined if dialect has no default
  dialectStrict?: (d: Dialect) => T | undefined; // returns undefined if dialect has no default
}

export const ENGINE_RULES: Record<
  string, // domain, e.g., "constraints", "transaction"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Record<string, EngineRuleSpec<any>> // rules inside the domain
> = {
  ddl: {
    supportsInlineForeignKeys: {
      dialectStrict: (d: Dialect) =>
        DIALECT_RULES[d].ddl.supportsInlineForeignKeys,
      engineDefault: true,
    },
    ctasColumnListOverridesQueryColumns: {
      dialectStrict: (d: Dialect) =>
        DIALECT_RULES[d].ddl.supportsInlineForeignKeys,
      engineDefault: false,
    },
    ctasColumnListMustMatchQueryColumnCount: {
      dialectStrict: (d: Dialect) =>
        DIALECT_RULES[d].ddl.supportsInlineForeignKeys,
      engineDefault: false,
    },
  },

  constraints: {
    validateExistingDataOnAdd: {
      engineDefault: true,
    },

    allowNullableForeignKeys: {
      dialectDefault: (d: Dialect) =>
        DIALECT_RULES[d].constraints.allowNullableForeignKeys,
      engineDefault: true,
    },

    foreignKeyDefaultOnDelete: {
      dialectDefault: (d: Dialect) =>
        DIALECT_RULES[d].constraints.foreignKeyDefaultOnDelete,
      engineDefault: "restrict",
    },

    foreignKeyDefaultOnUpdate: {
      dialectDefault: (d: Dialect) =>
        DIALECT_RULES[d].constraints.foreignKeyDefaultOnUpdate,
      engineDefault: "restrict",
    },

    requireExplicitNames: {
      dialectDefault: (d: Dialect) =>
        DIALECT_RULES[d].constraints?.requireExplicitNames,
      engineDefault: false,
    },

    nullsDistinct: {
      dialectDefault: (d: Dialect) =>
        DIALECT_RULES[d].constraints?.nullsDistinct,
      engineDefault: true,
    },
  },

  tablePolicy: {
    allowMultipleAutoIncrementColumns: {
      dialectStrict: (d: Dialect) =>
        DIALECT_RULES[d].tablePolicy?.allowMultipleAutoIncrementColumns,
      engineDefault: true,
    },
  },

  autoIncrementColumnPolicy: {
    autoIncrementNullGenerates: {
      dialectDefault: (d: Dialect) =>
        DIALECT_RULES[d].autoIncrementColumnPolicy?.autoIncrementNullGenerates,
      engineDefault: false,
    },
    autoIncrementZeroGenerates: {
      dialectDefault: (d: Dialect) =>
        DIALECT_RULES[d].autoIncrementColumnPolicy?.autoIncrementZeroGenerates,
      engineDefault: false,
    },
    autoIncrementExplicitValueAdvances: {
      dialectDefault: (d: Dialect) =>
        DIALECT_RULES[d].autoIncrementColumnPolicy
          ?.autoIncrementExplicitValueAdvances,
      engineDefault: false,
    },
    autoIncrementAllowsExplicitValue: {
      dialectDefault: (d: Dialect) =>
        DIALECT_RULES[d].autoIncrementColumnPolicy
          ?.autoIncrementAllowsExplicitValue,
      engineDefault: true,
    },
    autoIncrementAllowsExplicitDefault: {
      dialectDefault: (d: Dialect) =>
        DIALECT_RULES[d].autoIncrementColumnPolicy
          ?.autoIncrementAllowsExplicitDefault,
      engineDefault: true,
    },
  },

  transaction: {
    isolationLevel: {
      dialectDefault: (d: Dialect) =>
        DIALECT_RULES[d].transaction?.isolationLevel,
      engineDefault: "READ COMMITTED",
    },

    autoCommit: {
      dialectDefault: (d: Dialect) => DIALECT_RULES[d].transaction?.autoCommit,
      engineDefault: true,
    },

    trackStatementHistory: {
      engineDefault: true,
    },
  },

  input: {
    keywords: {
      dialectDefault: (d: Dialect) => DIALECT_RULES[d].input?.keywords,
      engineDefault: new Set<Keyword>([DEFAULT]),
    },

    temporalExpressions: {
      dialectDefault: (d: Dialect) =>
        DIALECT_RULES[d].input?.temporalExpressions,
      engineDefault: new Set<TemporalExpressionKeyword>([CURRENT_TIMESTAMP]),
    },

    sqlFunctions: {
      dialectDefault: (d: Dialect) => DIALECT_RULES[d].input?.sqlFunctions,
      engineDefault: new Set<SqlFunctionKeyword>([NOW]),
    },
  },

  default: {
    resultColumnName: {
      engineDefault: "__DEFAULT_COLUMN:",
    },
  },
};
