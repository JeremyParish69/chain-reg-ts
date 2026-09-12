import { ValidationRule } from "../../src/validation/ValidationRule.js";
import { ValidationRuleset } from "../../src/validation/ValidationRuleset.js";
import { ValidationEngine } from "../../src/validation/ValidationEngine.js";
import { describe, expect, it } from "vitest";
import { createTestPostgresSql, freshEngine } from "../utils/engineHelpers.js";
import { col } from "../../src/ast/dsl.js";
import { SQL_DECIMAL, SQL_VARCHAR } from "../../src/types/SqlType.js";
import { createTableTestSpec } from "../utils/buildSchema.js";


describe("ValidationEngine::validate", () => {
  it("passes when a UNIQUE validation rule is satisfied", () => {
    const engine = freshEngine();
    const sql = createTestPostgresSql(engine);

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

    sql
      .insertInto("Users", ["Id", "Name"])
      .values([
        [1, "Alice"],
        [2, "Bob"],
      ])
      .execute();

    sql.commit().execute();

    const rule = new ValidationRule({
      name: "Unique User IDs",
      statements: [
        sql
          .alterTable("Users")
          .addConstraint("UniqueUserIds")
          .unique(["Id"])
          .asConstraintStatement(),
      ],
    });

    const ruleset = ValidationRuleset
      .create({ name: "User Validation" })
      .withRule(rule);

    const report = ValidationEngine.validate({
      engine,
      databaseName: "DB1",
      ruleset,
    });

    expect(report.passed).toBe(true);
    expect(report.failed).toBe(false);
    expect(report.violationCount).toBe(0);
    expect(report.violations).toHaveLength(0);
    expect(report.failedRules).toHaveLength(0);
  });

  it("reports a UNIQUE violation", () => {
    const engine = freshEngine();
    const sql = createTestPostgresSql(engine);

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

    sql
      .insertInto("Users", ["Id", "Name"])
      .values([
        [1, "Alice"],
        [1, "Bob"],
      ])
      .execute();

    sql.commit().execute();


    const rule = new ValidationRule({
      name: "Unique User IDs",
      statements: [
        sql
          .alterTable("Users")
          .addConstraint("UniqueUserIds")
          .unique(["Id"])
          .asConstraintStatement(),
      ],
    });

    const ruleset = ValidationRuleset
      .create({ name: "User Validation" })
      .withRule(rule);

    const report = ValidationEngine.validate({
      engine,
      databaseName: "DB1",
      ruleset,
    });

    expect(report.passed).toBe(false);
    expect(report.failed).toBe(true);
    expect(report.violationCount).toBe(1);
    expect(report.failedRules).toHaveLength(1);

    const violation = report.violations[0];

    expect(violation.participants).toHaveLength(2);

    for (const participant of violation.participants) {
      expect(participant.tableName).toBe("Users");
      expect(participant.columns).toHaveLength(1);
      expect(participant.columnNames).toEqual(["Id"]);
      expect(participant.columnValues).toEqual([1]);
    }
  });

  it("reports a CHECK violation", () => {
    const engine = freshEngine();
    const sql = createTestPostgresSql(engine);

    sql.createDatabase("DB1").execute();

    sql.useDatabase("DB1").execute();

    sql.begin().execute();

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
        [-1],
      ])
      .execute();

    sql.commit().execute();

    const rule = new ValidationRule({
      name: "Positive User IDs",
      statements: [
        sql
          .alterTable("Users")
          .addConstraint("PositiveUserIds")
          .check(
            col("Id").gt(0),
          )
          .asConstraintStatement(),
      ],
    });

    const ruleset = ValidationRuleset
      .create({ name: "User Validation" })
      .withRule(rule);

    const report = ValidationEngine.validate({
      engine,
      databaseName: "DB1",
      ruleset,
    });

    expect(report.passed).toBe(false);
    expect(report.failed).toBe(true);
    expect(report.violationCount).toBe(1);
    expect(report.failedRules).toHaveLength(1);

    const violation = report.violations[0];

    expect(violation.participants).toHaveLength(1);

    const participant = violation.participants[0];

    expect(participant.tableName).toBe("Users");
    expect(participant.rowId).toBe(1);
    expect(participant.columns).toHaveLength(1);
    expect(participant.columnNames).toEqual(["Id"]);
    expect(participant.columnValues).toEqual([-1]);
  });

  it("reports a FOREIGN KEY violation", () => {
    const engine = freshEngine();
    const sql = createTestPostgresSql(engine);

    sql.createDatabase("DB1").execute();

    sql.useDatabase("DB1").execute();

    sql.begin().execute();

    sql.createTable(...createTableTestSpec("Users", {
      Id: {
        type: SQL_DECIMAL,
        nullable: false,
        primaryKey: true,
      },
    })).execute();

    sql.createTable(...createTableTestSpec("Orders", {
      UserId: {
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

    sql
      .insertInto("Orders", ["UserId"])
      .values([
        [999],
      ])
      .execute();

    sql.commit().execute();

    const rule = new ValidationRule({
      name: "Valid Order Users",
      statements: [
        sql
          .alterTable("Orders")
          .addConstraint("OrdersUserIdFK")
          .foreignKey(["UserId"])
          .references("Users", ["Id"])
          .asConstraintStatement(),
      ],
    });

    const ruleset = ValidationRuleset
      .create({ name: "Order Validation" })
      .withRule(rule);

    const report = ValidationEngine.validate({
      engine,
      databaseName: "DB1",
      ruleset,
    });

    expect(report.passed).toBe(false);
    expect(report.failed).toBe(true);
    expect(report.violationCount).toBe(1);

    const violation = report.violations[0];

    expect(violation.participants).toHaveLength(1);

    const participant = violation.participants[0];

    expect(participant.tableName).toBe("Orders");
    expect(participant.columnNames).toEqual(["UserId"]);
    expect(participant.columnValues).toEqual([999]);
    expect(participant.referencedTableName).toBe("Users");
    expect(participant.referencedColumnNames).toEqual(["Id"]);
  });

  it("evaluates all rules in a ruleset", () => {
    const engine = freshEngine();
    const sql = createTestPostgresSql(engine);

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

    sql
      .insertInto("Users", ["Id", "Name"])
      .values([
        [1, "Alice"],
        [1, "Bob"],
      ])
      .execute();

    sql.commit().execute();

    const passingRule = new ValidationRule({
      name: "Unique Names",
      statements: [
        sql
          .alterTable("Users")
          .addConstraint("UniqueNames")
          .unique(["Name"])
          .asConstraintStatement(),
      ],
    });

    const failingRule = new ValidationRule({
      name: "Unique IDs",
      statements: [
        sql
          .alterTable("Users")
          .addConstraint("UniqueIds")
          .unique(["Id"])
          .asConstraintStatement(),
      ],
    });

    const ruleset = ValidationRuleset
      .create({ name: "User Validation" })
      .withRule(passingRule)
      .withRule(failingRule);

    const report = ValidationEngine.validate({
      engine,
      databaseName: "DB1",
      ruleset,
    });

    expect(report.ruleResults).toHaveLength(2);

    expect(report.ruleResults[0].rule.name).toBe("Unique Names");
    expect(report.ruleResults[0].passed).toBe(true);

    expect(report.ruleResults[1].rule.name).toBe("Unique IDs");
    expect(report.ruleResults[1].failed).toBe(true);

    expect(report.passed).toBe(false);
    expect(report.failed).toBe(true);
    expect(report.failedRules).toHaveLength(1);
    expect(report.violationCount).toBe(1);
  });

  it("evaluates multiple statements in a rule until one fails", () => {
    const engine = freshEngine();
    const sql = createTestPostgresSql(engine);

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

    sql
      .insertInto("Users", ["Id", "Name"])
      .values([
        [1, "Alice"],
        [1, "Bob"],
      ])
      .execute();

    sql.commit().execute();

    const rule = new ValidationRule({
      name: "User Constraints",
      statements: [
        sql
          .alterTable("Users")
          .addConstraint("UniqueNames")
          .unique(["Name"])
          .asConstraintStatement(),

        sql
          .alterTable("Users")
          .addConstraint("UniqueIds")
          .unique(["Id"])
          .asConstraintStatement(),
      ],
    });

    const ruleset = ValidationRuleset
      .create({ name: "User Validation" })
      .withRule(rule);

    const report = ValidationEngine.validate({
      engine,
      databaseName: "DB1",
      ruleset,
    });

    expect(report.passed).toBe(false);
    expect(report.violationCount).toBe(1);
    expect(report.violations[0].participants).toHaveLength(2);

    expect(
      report.violations[0].participants[0].columnNames,
    ).toEqual(["Id"]);
  });

  it("stops evaluating statements after the first violation", () => {
    const engine = freshEngine();
    const sql = createTestPostgresSql(engine);

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

    sql
      .insertInto("Users", ["Id", "Name"])
      .values([
        [1, "Alice"],
        [1, "Bob"],
      ])
      .execute();

    sql.commit().execute();

    const rule = new ValidationRule({
      name: "User Constraints",
      statements: [
        sql
          .alterTable("Users")
          .addConstraint("UniqueIds")
          .unique(["Id"])
          .asConstraintStatement(),

        sql
          .alterTable("Users")
          .addConstraint("UniqueNames")
          .unique(["Name"])
          .asConstraintStatement(),
      ],
    });

    const ruleset = ValidationRuleset
      .create({ name: "User Validation" })
      .withRule(rule);

    const report = ValidationEngine.validate({
      engine,
      databaseName: "DB1",
      ruleset,
    });

    expect(report.violationCount).toBe(1);

    const violation = report.violations[0];

    expect(violation.participants).toHaveLength(2);

    for (const participant of violation.participants) {
      expect(participant.columnNames).toEqual(["Id"]);
    }
  });

  it("rolls back validation changes", () => {
    const engine = freshEngine();
    const sql = createTestPostgresSql(engine);

    sql.createDatabase("DB1").execute();

    sql.useDatabase("DB1").execute();

    sql.begin().execute();

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

    sql.commit().execute();

    const rule = new ValidationRule({
      name: "Unique IDs",
      statements: [
        sql
          .alterTable("Users")
          .addConstraint("UniqueIds")
          .unique(["Id"])
          .asConstraintStatement(),
      ],
    });

    const ruleset = ValidationRuleset
      .create({ name: "User Validation" })
      .withRule(rule);

    const firstReport = ValidationEngine.validate({
      engine,
      databaseName: "DB1",
      ruleset,
    });

    expect(firstReport.passed).toBe(true);

    const secondReport = ValidationEngine.validate({
      engine,
      databaseName: "DB1",
      ruleset,
    });

    expect(secondReport.passed).toBe(true);
  });

  it("propagates unexpected errors", () => {
    const engine = freshEngine();
    const sql = createTestPostgresSql(engine);

    sql.createDatabase("DB1").execute();

    sql.useDatabase("DB1").execute();

    sql.begin().execute();

    sql.createTable(...createTableTestSpec("Users", {
      Id: {
        type: SQL_DECIMAL,
        nullable: false,
      },
    })).execute();

    sql.commit().execute();

    const rule = new ValidationRule({
      name: "Invalid Constraint",
      statements: [
        sql
          .alterTable("MissingTable")
          .addConstraint("UniqueIds")
          .unique(["Id"])
          .asConstraintStatement(),
      ],
    });

    const ruleset = ValidationRuleset
      .create({ name: "User Validation" })
      .withRule(rule);

    expect(() =>
      ValidationEngine.validate({
        engine,
        databaseName: "DB1",
        ruleset,
      }),
    ).toThrow();
  });
});

describe("ValidationEngine::validate participants", () => {
  it("resolves CHECK violation participants", () => {
    const engine = freshEngine();
    const sql = createTestPostgresSql(engine);

    sql.createDatabase("DB1").execute();

    sql.useDatabase("DB1").execute();

    sql.begin().execute();

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
        [-1],
      ])
      .execute();

    sql.commit().execute();

    const ruleset = ValidationRuleset
      .create({ name: "User Validation" })
      .withRule({
        name: "Positive IDs",
        statements: [
          sql
            .alterTable("Users")
            .addConstraint("PositiveIds")
            .check(col("Id").gt(0))
            .asConstraintStatement(),
        ],
      });

    const report = ValidationEngine.validate({
      engine,
      databaseName: "DB1",
      ruleset,
    });

    expect(report.passed).toBe(false);
    expect(report.violationCount).toBe(1);

    const participants = report.violations[0].participants;

    expect(participants).toHaveLength(1);
    expect(participants[0].tableName).toBe("Users");
    expect(participants[0].rowId).toBe(1);
    expect(participants[0].columnNames).toEqual(["Id"]);
    expect(participants[0].columnValues).toEqual([-1]);
  });

  it("resolves UNIQUE violation participants", () => {
    const engine = freshEngine();
    const sql = createTestPostgresSql(engine);

    sql.createDatabase("DB1").execute();

    sql.useDatabase("DB1").execute();

    sql.begin().execute();

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
        [1],
      ])
      .execute();

    sql.commit().execute();

    const ruleset = ValidationRuleset
      .create({ name: "User Validation" })
      .withRule({
        name: "Unique IDs",
        statements: [
          sql
            .alterTable("Users")
            .addConstraint("UniqueIds")
            .unique(["Id"])
            .asConstraintStatement(),
        ],
      });

    const report = ValidationEngine.validate({
      engine,
      databaseName: "DB1",
      ruleset,
    });

    expect(report.passed).toBe(false);
    expect(report.violationCount).toBe(1);

    const participants = report.violations[0].participants;

    expect(participants).toHaveLength(2);

    expect(participants[0].tableName).toBe("Users");
    expect(participants[0].rowId).toBe(0);
    expect(participants[0].columnNames).toEqual(["Id"]);
    expect(participants[0].columnValues).toEqual([1]);

    expect(participants[1].tableName).toBe("Users");
    expect(participants[1].rowId).toBe(1);
    expect(participants[1].columnNames).toEqual(["Id"]);
    expect(participants[1].columnValues).toEqual([1]);

    expect(participants[0].referencedTable).toBeUndefined();
    expect(participants[0].referencedTableName).toBeUndefined();
    expect(participants[0].referencedColumns).toBeUndefined();
    expect(participants[0].referencedColumnNames).toBeUndefined();
  });

  it("resolves FOREIGN KEY violation participants", () => {
    const engine = freshEngine();
    const sql = createTestPostgresSql(engine);

    sql.createDatabase("DB1").execute();

    sql.useDatabase("DB1").execute();

    sql.begin().execute();

    sql.createTable(...createTableTestSpec("Parents", {
      Id: {
        type: SQL_DECIMAL,
        nullable: false,
        primaryKey: true,
      },
    })).execute();

    sql.createTable(...createTableTestSpec("Children", {
      ParentId: {
        type: SQL_DECIMAL,
        nullable: false,
      },
    })).execute();

    sql
      .insertInto("Parents", ["Id"])
      .values([
        [1],
      ])
      .execute();

    sql
      .insertInto("Children", ["ParentId"])
      .values([
        [1],
        [999],
      ])
      .execute();

    sql.commit().execute();

    const ruleset = ValidationRuleset
      .create({ name: "Relationship Validation" })
      .withRule({
        name: "Valid Parent References",
        statements: [
          sql
            .alterTable("Children")
            .addConstraint("ValidParentReferences")
            .foreignKey(["ParentId"])
            .references("Parents", ["Id"])
            .asConstraintStatement(),
        ],
      });

    const report = ValidationEngine.validate({
      engine,
      databaseName: "DB1",
      ruleset,
    });

    expect(report.passed).toBe(false);
    expect(report.violationCount).toBe(1);

    const participants = report.violations[0].participants;

    expect(participants).toHaveLength(1);

    expect(participants[0].tableName).toBe("Children");
    expect(participants[0].rowId).toBe(1);
    expect(participants[0].columnNames).toEqual(["ParentId"]);
    expect(participants[0].columnValues).toEqual([999]);

    expect(participants[0].referencedTableName).toBe("Parents");
    expect(participants[0].referencedColumns).toBeDefined();
    expect(participants[0].referencedColumnNames).toEqual(["Id"]);
  });
});

describe("ValidationEngine::validate rule evaluation", () => {
  it("stops evaluating a rule after its first failing statement", () => {
    const engine = freshEngine();
    const sql = createTestPostgresSql(engine);

    sql.createDatabase("DB1").execute();

    sql.useDatabase("DB1").execute();

    sql.begin().execute();

    sql.createTable(...createTableTestSpec("Users", {
      Id: {
        type: SQL_DECIMAL,
        nullable: false,
      },
    })).execute();

    sql
      .insertInto("Users", ["Id"])
      .values([
        [-1],
      ])
      .execute();

    sql.commit().execute();

    const ruleset = ValidationRuleset
      .create({ name: "User Validation" })
      .withRule({
        name: "User Constraints",
        statements: [
          sql
            .alterTable("Users")
            .addConstraint("PositiveIds")
            .check(col("Id").gt(0))
            .asConstraintStatement(),

          sql
            .alterTable("Users")
            .addConstraint("AnotherPositiveIds")
            .check(col("Id").gt(100))
            .asConstraintStatement(),
        ],
      });

    const report = ValidationEngine.validate({
      engine,
      databaseName: "DB1",
      ruleset,
    });

    expect(report.violationCount).toBe(1);
    expect(report.ruleResults).toHaveLength(1);
    expect(report.ruleResults[0].violations).toHaveLength(1);
  });
});

it("does not modify committed database state", () => {
  const engine = freshEngine();
  const sql = createTestPostgresSql(engine);

  sql.createDatabase("DB1").execute();

  sql.useDatabase("DB1").execute();

  sql.begin().execute();

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
      [1],
    ])
    .execute();

  sql.commit().execute();

  const databaseBefore = engine.databases.requireByName("DB1");
  const tableBefore = databaseBefore.tables.requireByName("Users");

  const ruleset = ValidationRuleset
    .create({ name: "User Validation" })
    .withRule({
      name: "Unique IDs",
      statements: [
        sql
          .alterTable("Users")
          .addConstraint("UniqueIds")
          .unique(["Id"])
          .asConstraintStatement(),
      ],
    });

  const report = ValidationEngine.validate({
    engine,
    databaseName: "DB1",
    ruleset,
  });

  expect(report.failed).toBe(true);

  const databaseAfter = engine.databases.requireByName("DB1");
  const tableAfter = databaseAfter.tables.requireByName("Users");

  expect(databaseAfter).toBe(databaseBefore);
  expect(tableAfter).toBe(tableBefore);
  expect(tableAfter.requireRow(0)).toEqual([1]);
  expect(tableAfter.requireRow(1)).toEqual([1]);
});

it("propagates unexpected errors", () => {
  const engine = freshEngine();
  const sql = createTestPostgresSql(engine);

  sql.createDatabase("DB1").execute();

  sql.useDatabase("DB1").execute();

  sql.begin().execute();

  sql.createTable(...createTableTestSpec("Users", {
    Id: {
      type: SQL_DECIMAL,
      nullable: false,
    },
  })).execute();

  sql.commit().execute();

  const ruleset = ValidationRuleset
    .create({ name: "User Validation" })
    .withRule({
      name: "Missing Table",
      statements: [
        sql
          .alterTable("MissingTable")
          .addConstraint("MissingConstraint")
          .unique(["Id"])
          .asConstraintStatement(),
      ],
    });

  expect(() =>
    ValidationEngine.validate({
      engine,
      databaseName: "DB1",
      ruleset,
    }),
  ).toThrow();
});