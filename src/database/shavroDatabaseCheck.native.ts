import { getShavroDatabase } from "./shavroDatabase.native";

interface TableRow {
  name: string;
}

interface ColumnRow {
  name: string;
  type: string;
  notnull: number;
}

const REQUIRED_TABLES = [
  "expenses",
  "incomes",
  "migration_state",
  "custom_categories",
  "custom_payment_methods",
];

export async function verifyShavroDatabase(): Promise<void> {
  const db = await getShavroDatabase();

  const tables = await db.getAllAsync<TableRow>(
    `SELECT name
       FROM sqlite_master
       WHERE type = 'table'`,
  );

  const names = new Set(tables.map((table) => table.name));

  for (const required of REQUIRED_TABLES) {
    if (!names.has(required)) {
      throw new Error(`Missing Shavro SQLite table: ${required}`);
    }
  }

  const version = await db.getFirstAsync<{
    user_version: number;
  }>("PRAGMA user_version");

  if (version?.user_version !== 3) {
    throw new Error("Unexpected Shavro database version.");
  }

  for (const table of ["custom_categories", "custom_payment_methods"]) {
    const columns = await db.getAllAsync<ColumnRow>(
      `PRAGMA table_info("${table}")`,
    );

    const position = columns.find((column) => column.name === "position");

    if (
      !position ||
      position.type.toUpperCase() !== "INTEGER" ||
      position.notnull !== 1
    ) {
      throw new Error(`Missing or invalid position column: ${table}`);
    }
  }

  const integrity = await db.getFirstAsync<{
    integrity_check: string;
  }>("PRAGMA integrity_check");

  if (integrity?.integrity_check !== "ok") {
    throw new Error("Shavro SQLite integrity verification failed.");
  }

  console.log(
    "[Shavro Database] Version 3 schema verified: " +
      REQUIRED_TABLES.join(", "),
  );
}
