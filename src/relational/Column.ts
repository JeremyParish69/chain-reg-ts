import { Immutable } from "../infrastructure/Immutable.js";
import { type ReferentialAction } from "./ReferentialAction.js";
import { type ColumnInput } from "../types/ColumnInput.js";
import { type PredicateNode } from "../ast/predicate/PredicateNode.js";
import { type ColumnValue } from "../types/ColumnValue.js";
import { DEFAULT } from "../dialect/keywords.js";
import {
  canBeIndexed,
  castValue,
  isAssignable,
  matchesSqlType,
  SQL_DECIMAL,
  SQL_INTEGER,
  type SqlType,
} from "../types/SqlType.js";

export type ColumnId = number & { readonly __brand: "ColumnId" };

export class Column extends Immutable {
  public readonly name: string;
  public readonly type: SqlType;
  public readonly nullable: boolean;
  public readonly defaultValue?: ColumnValue;
  public readonly enumValues?: readonly ColumnValue[];
  public readonly autoIncrementStep?: number;
  public readonly autoIncrementStart?: number;

  public readonly id: ColumnId;
  public readonly position: number; //0-index

  public readonly data: ColumnValue[];
  public readonly autoIncrementNext?: number;

  public readonly autoIncrementNullGenerates: boolean;
  public readonly autoIncrementZeroGenerates: boolean;
  public readonly autoIncrementExplicitValueAdvances: boolean;

  public readonly autoIncrementAllowsExplicitValue: boolean;
  public readonly autoIncrementAllowsExplicitDefault: boolean;

  validate(): void {}

  private constructor(
    spec: ColumnSpec & {
      id: ColumnId;
      position: number;
    },
    policy?: ColumnPolicy,
  ) {
    super();

    // Spec
    this.name = spec.name;
    this.type = spec.type;
    this.nullable = spec.nullable ?? true;
    this.defaultValue = spec.defaultValue;
    this.enumValues = spec.enumValues;
    this.autoIncrementStep = spec.autoIncrementStep;
    this.autoIncrementStart = spec.autoIncrementStart;

    this.id = spec.id;
    this.position = spec.position;
    if (this.autoIncrementStep !== undefined) {
      this.autoIncrementNext = this.autoIncrementStart ?? 1;
    }
    this.data = [];

    // Policy
    this.autoIncrementNullGenerates =
      policy?.autoIncrementNullGenerates ?? false;
    this.autoIncrementZeroGenerates =
      policy?.autoIncrementZeroGenerates ?? false;
    this.autoIncrementExplicitValueAdvances =
      policy?.autoIncrementExplicitValueAdvances ?? true;

    this.autoIncrementAllowsExplicitValue =
      policy?.autoIncrementAllowsExplicitValue ?? true;
    this.autoIncrementAllowsExplicitDefault =
      policy?.autoIncrementAllowsExplicitDefault ?? true;

    this.validate();
    this.seal();
  }

  public static create(
    spec: ColumnSpec & {
      id: ColumnId;
      position: number;
    },
    policy?: ColumnPolicy,
  ): Column {
    validateColumnSpec(spec);

    return new this(spec, policy);
  }

  public backfill(numRows: number, value: ColumnValue): Column {
    return this.with({
      data: Array(numRows).fill(value),
    } as Partial<this>);
  }

  public alter(newType: SqlType): Column {
    const oldType = this.type;

    if (oldType === newType) {
      throw new Error(`Column types already identical`);
    }

    if (!isAssignable(oldType, newType)) {
      throw new Error(
        `Cannot alter column ${this.name}:
        ${oldType} cannot convert to ${newType}`,
      );
    }

    const newSpec: ColumnSpec = { ...this, type: newType };
    validateColumnSpec(newSpec);

    const widenedData: ColumnValue[] = this.data.map((value) =>
      castValue(value, newType),
    );

    return this.with({
      type: newType,
      data: widenedData,
    } as Partial<this>);
  }

  public tryDecrementPosition(position: number): this {
    if (this.position === undefined) {
      throw new Error(`Column does not have position`);
    }

    if (this.position < position) return this;

    return this.with({
      position: this.position - 1,
    } as Partial<this>);
  }

  public getDatumAtRow(rowNum: number): ColumnValue | undefined {
    return this.data[rowNum];
  }

  public requireDatumAtRow(rowNum: number): ColumnValue {
    const datum = this.getDatumAtRow(rowNum);
    if (datum === undefined) {
      throw new Error(`Value undefined.`);
    }
    return datum;
  }

  private assertDatumTypeMatchesColumnType(datum: ColumnValue): void {
    if (!matchesSqlType(datum, this.type)) {
      throw new Error(`Value type does not match Column Type.`);
    }
  }

  private assertNullabilityConstraint(value: ColumnValue): void {
    if (this.nullable === false && value === null) {
      throw new Error(`Column '${this.name}' cannot have NULL value`);
    }
  }

  private assertEnumValuesConstraint(value: ColumnValue): void {
    if (this.enumValues && !this.enumValues.includes(value)) {
      throw new Error(`Column '${this.name}' value must be in enum values`);
    }
  }

  public assertDatum(datum: ColumnValue): void {
    this.assertDatumTypeMatchesColumnType(datum);
    this.assertNullabilityConstraint(datum);
    this.assertEnumValuesConstraint(datum);
  }

  isAutoIncrement(): this is this & {
    autoIncrementStep: number;
    autoIncrementNext: number;
  } {
    return (
      this.autoIncrementStep !== undefined &&
      this.autoIncrementNext !== undefined
    );
  }

  private resolveDefault(): {
    value: ColumnValue;
    nextAutoIncrementNext: number | undefined;
  } {
    let value: ColumnValue;
    let nextAutoIncrementNext = this.autoIncrementNext;

    if (this.defaultValue !== undefined) {
      value = this.defaultValue;
    } else if (this.isAutoIncrement()) {
      value = this.autoIncrementNext;
      nextAutoIncrementNext = value + this.autoIncrementStep;
    } else if (this.nullable) {
      value = null;
    } else {
      throw new Error(`Cannot resolve default for Column ${this.name}`);
    }

    return {
      value,
      nextAutoIncrementNext: nextAutoIncrementNext,
    };
  }

  private resolveAutoIncrementNext(cellValue: ColumnValue): number | undefined {
    if (
      this.isAutoIncrement() &&
      this.autoIncrementExplicitValueAdvances &&
      typeof cellValue === "number" &&
      cellValue > this.autoIncrementNext
    ) {
      return cellValue + this.autoIncrementStep;
    }

    return this.autoIncrementNext;
  }

  public addCell(input: ColumnInput | undefined): Column {
    let cellValue = input;
    let nextAutoIncrementNext: number | undefined = undefined;

    if (cellValue === DEFAULT || cellValue === undefined) {
      const resolved = this.resolveDefault();
      cellValue = resolved.value;
      nextAutoIncrementNext = resolved.nextAutoIncrementNext;
    } else if (this.isAutoIncrement()) {
      if (
        (this.autoIncrementNullGenerates &&
          cellValue === null &&
          !this.nullable) ||
        (this.autoIncrementZeroGenerates && cellValue === 0)
      ) {
        cellValue = this.autoIncrementNext;
        nextAutoIncrementNext = cellValue + this.autoIncrementStep;
      } else {
        nextAutoIncrementNext = this.resolveAutoIncrementNext(cellValue);
      }
    }

    this.assertDatum(cellValue);

    return this.with({
      data: [...this.data, cellValue],
      autoIncrementNext: nextAutoIncrementNext,
    } as Partial<this>);
  }

  public updateCell(input: ColumnInput, rowNum: number): Column {
    this.requireDatumAtRow(rowNum);

    let cellValue = input;
    let nextAutoIncrementNext: number | undefined = undefined;

    if (cellValue === DEFAULT) {
      const resolved = this.resolveDefault();
      cellValue = resolved.value;
      nextAutoIncrementNext = resolved.nextAutoIncrementNext;
    } else if (this.isAutoIncrement()) {
      if (
        (this.autoIncrementNullGenerates &&
          cellValue === null &&
          !this.nullable) ||
        (this.autoIncrementZeroGenerates && cellValue === 0)
      ) {
        cellValue = this.autoIncrementNext;
        nextAutoIncrementNext = cellValue + this.autoIncrementStep;
      } else {
        nextAutoIncrementNext = this.resolveAutoIncrementNext(cellValue);
      }
    }

    this.assertDatum(cellValue);

    const updatedData = [...this.data];
    updatedData[rowNum] = cellValue;

    return this.with({
      data: updatedData,
      autoIncrementNext: nextAutoIncrementNext,
    } as Partial<this>);
  }

  public rename(newName: string): Column {
    return this.with({
      name: newName,
    } as Partial<this>);
  }
}

export type ColumnSpec = {
  name: string;
  type: SqlType;
  nullable?: boolean;
  defaultValue?: ColumnValue;
  enumValues?: readonly ColumnValue[];
  autoIncrementStep?: number;
  autoIncrementStart?: number;
};

export type ColumnPolicy = {
  autoIncrementNullGenerates?: boolean;
  autoIncrementZeroGenerates?: boolean;
  autoIncrementExplicitValueAdvances?: boolean;
  autoIncrementAllowsExplicitDefault?: boolean;
  autoIncrementAllowsExplicitValue?: boolean;
};

export function validateColumnSpec(spec: ColumnSpec): void {
  if (
    spec.autoIncrementStep !== undefined &&
    spec.type !== SQL_INTEGER &&
    spec.type !== SQL_DECIMAL
  ) {
    throw new Error(
      `Column: "${spec.name}" can only autoIncrement as a number type.`,
    );
  }

  if (spec.autoIncrementStep !== undefined && spec.defaultValue !== undefined) {
    throw new Error(`Column cannot have default value and autoIncrement.`);
  }
}

export type InlineColumnSpec = ColumnSpec & {
//export type InlineColumnSpec = Omit<ColumnSpec, "name"> & {
  unique?: boolean;
  primaryKey?: boolean;
  references?: {
    table: string;
    column: string;
    onDelete?: ReferentialAction;
    onUpdate?: ReferentialAction;
  };
  check?: PredicateNode;
};

export type ColumnShape = Omit<ColumnSpec, "name"> & {
  autoIncrement?: {
    next?: number; // must be reset on copy
    step: number;
  };
};

export function assertTypeIndexable(type: SqlType): void {
  if (!canBeIndexed(type)) {
    throw new Error(`Type ${type.kind} is not Indexable`);
  }
}
