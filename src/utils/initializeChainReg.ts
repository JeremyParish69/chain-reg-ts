import { EngineRegistry } from "../engine/EngineRegistry.js";
import { type PostgresInputBatch } from "../input/PostgresInputBatch.js";
import { ImportMapping } from "../mapping/import/ImportMapping.js";
import { ImportPipeline } from "../mapping/pipeline/ImportPipeline.js";
import {
  captureScalar,
  case_,
  concat,
  current,
  value,
  literal,
} from "../mapping/dsl/expression/functions.js";
import {
  every,
  isNull,
  isNotNull,
} from "../mapping/dsl/predicate/functions.js";
import { ImportRoot } from "../mapping/import/ImportRoot.js";
import { discovery, path } from "../mapping/import/dsl.js";
import { DiscoveryRoot } from "../mapping/discovery/DiscoveryRoot.js";
import { SQL_DECIMAL } from "../types/SqlType.js";

const _CCR1_PATH: string = "../chain-registry";

EngineRegistry.getInstance().newEngine();
const engine = EngineRegistry.getInstance().engine();
const sql: PostgresInputBatch = engine.input() as PostgresInputBatch;

export const exampleChainRegistry_ImportDefinition = () => {
  const imagesImportMapping = new ImportMapping({
    tableName: "Images",
    source: path("images"),
    fields: {
      owner: captureScalar("owner"),
      imageSyncOwner: case_(
        [
          {
            when: every(
              isNull(value("image_sync.base_denom")),
              isNotNull(value("image_sync.chain_name")),
            ),
            then: concat(literal("Chain:"), value("image_sync.chain_name")),
          },
          {
            when: isNotNull(value("image_sync.chain_name")),
            then: concat(
              literal("Asset:"),
              value("image_sync.chain_name"),
              literal(":"),
              value("image_sync.base_denom"),
            ),
          },
        ],
        literal(null),
      ),
    },
  });

  const logoUrisImportMapping = new ImportMapping({
    tableName: "Images",
    source: path("logo_URIs"),
    fields: {
      owner: captureScalar("owner"),
      type: literal("logo"),
    },
  });

  const assetImportMapping = new ImportMapping({
    source: discovery("asset"),
    tableName: "Assets",
    fields: {
      owner: captureScalar("owner"),
    },
    children: [logoUrisImportMapping, imagesImportMapping],
  });

  const assetlistFileImportMapping = new ImportMapping({
    source: discovery("assetlistFile"),
    tableName: "Chains",
    prefix: "AssetlistFile",
    children: [assetImportMapping],
  });

  const chainFileImportMapping = new ImportMapping({
    source: discovery("chainFile"),
    tableName: "Chains",
    prefix: "ChainFile",
    fields: {
      displayName: concat(
        current().path("pretty_name").scalar(),
        literal(" ("),
        value("chain_id"),
        literal(")"),
      ),
      owner: captureScalar("owner"),
    },
    children: [logoUrisImportMapping, imagesImportMapping],
  });

  const chainDirectoryImportMapping = new ImportMapping({
    source: discovery("chainDirectory"),
    tableName: "Chains",
    flatten: false,
    prefix: "ChainDirectory",
    fields: {
      chainDirectoryName: captureScalar("chainDirectoryName"),
      networkKind: captureScalar("networkKind"),
      networkType: captureScalar("networkType"),
    },
    children: [chainFileImportMapping, assetlistFileImportMapping],
  });

  const networkTypeImportMapping = new ImportMapping({
    source: discovery("networkType"),
    children: [
      chainDirectoryImportMapping,
      //ibcConnectionImportMapping,
    ],
  });

  const networkKindImportMapping = new ImportMapping({
    source: discovery("networkKind"),
    children: [networkTypeImportMapping],
  });

  const testRegistryImportMapping = new ImportMapping({
    tableName: "Registries",
    fields: {
      registryName: captureScalar("registryName"),
    },
    children: [networkKindImportMapping],
  });

  return testRegistryImportMapping;
};

export function exampleChainRegistry_buildDatabase(
  testRegistryDiscoveryRoot: DiscoveryRoot,
  testRegistryImportMapping: ImportMapping,
) {
  console.log("Building Example Database");

  const testRegistryImportRoot = new ImportRoot({
    discovery: testRegistryDiscoveryRoot,
    mapping: testRegistryImportMapping,
  });

  const importRoots: ImportRoot[] = [testRegistryImportRoot];

  const result = ImportPipeline.build({
    importRoots: importRoots,
    databaseName: "Test Registry",
    existingDatabases: engine.databases,
    sourceIdentity: "Test Registry",
  });

  engine.install(result.databases);

  console.log(EngineRegistry.getInstance().engine().databases.databases);

  sql.useDatabase("test registry").execute();

  console.log("tables:");
  const tablesMap = result.databases.requireByName("Test Registry").tables;
  for (const table of tablesMap.values()) {
    console.log(table.name);
    if (table.name === "Chains") {
      for (const column of table.columns.values()) {
        console.log(column.name);
      }
    }
    if (table.name === "Images") {
      for (const column of table.columns.values()) {
        console.log(column.name);
      }
    }
  }

  const chainResult = sql.select("*").from("Chains").execute()[0];
  console.log("chainResult");
  console.log(chainResult);

  // const logoURIsResult = sql.select("*").from("LogoURIs").execute()[0];
  // console.log("logoURIsResult");
  // console.log(logoURIsResult);

  const imagesResult = sql.select("*").from("Images").execute()[0];
  console.log("imagesResult");
  console.log(imagesResult);

  const feeTokens = sql.select("*").from("FeeTokens").execute()[0];
  console.log("feeTokens");
  console.log(feeTokens);

  const assets = sql.select("*").from("Assets").execute()[0];
  console.log("assets");
  console.log(assets);

  // const denom_units = sql.select("*").from("DenomUnits").execute()[0];
  // console.log("denom_units");
  // console.log(denom_units);

  console.log("created chain reg");

  createTestDatabase();
}

function createTestDatabase() {
  console.log("1");
  sql.createDatabase("Test").execute();
  console.log("2");
  sql.useDatabase("Test").execute();
  console.log("3");
  sql
    .createTable("T1", [
      {
        name: "C1",
        type: SQL_DECIMAL,
        unique: false,
        autoIncrementStart: 0,
        autoIncrementStep: 1,
      },
    ])
    .execute();
  console.log("4");
  sql
    .insertInto("T1")
    .values([[2]])
    .execute();
  sql
    .insertInto("T1")
    .values([[4]])
    .execute();
  sql
    .insertInto("T1")
    .values([[sql.DEFAULT]])
    .execute();
  console.log("5");
  const rows1 = sql.select("*").from("T1").execute();
  console.log(rows1[0][0]);
  sql
    .insertInto("T1")
    .values([[1], [sql.DEFAULT]])
    .execute();
  console.log("6");
  const rows2 = sql.select("*").from("T1").execute();
  console.log(rows2[0]);
  console.log("7");

  engine.rules.autoIncrementColumnPolicy.autoIncrementAllowsExplicitDefault = false;
}
