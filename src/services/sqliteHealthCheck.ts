import { Platform } from "react-native";
import * as SQLite from "expo-sqlite";

const TEST_DATABASE_NAME = "shavro_sqlite_test.db";

export async function runSQLiteHealthCheck(): Promise<void> {
  if (Platform.OS === "web") {
    console.log("[SQLite] Web platform skipped.");
    return;
  }

  const database = await SQLite.openDatabaseAsync(TEST_DATABASE_NAME);

  try {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS shavro_health_check (
        id INTEGER PRIMARY KEY NOT NULL,
        message TEXT NOT NULL
      );
    `);

    await database.runAsync(
      `INSERT INTO shavro_health_check (id, message)
       VALUES (?, ?)
       ON CONFLICT(id) DO UPDATE SET
         message = excluded.message`,
      [1, "SQLite working"],
    );

    const result = await database.getFirstAsync<{
      id: number;
      message: string;
    }>("SELECT id, message FROM shavro_health_check WHERE id = ?", [1]);

    if (result?.id !== 1 || result.message !== "SQLite working") {
      throw new Error("SQLite health check failed: incorrect stored data.");
    }

    const integrity = await database.getFirstAsync<{
      integrity_check: string;
    }>("PRAGMA integrity_check;");

    if (integrity?.integrity_check !== "ok") {
      throw new Error("SQLite health check failed: database integrity error.");
    }

    console.log("[SQLite] Health check passed: SQLite working");
  } finally {
    await database.closeAsync();
  }
}
