import mysql from "mysql2/promise";
import { readFile } from "node:fs/promises";
import { createDatabaseConfig } from "./run-migrations.js";
let db;
try {
  const { waitForConnections, connectionLimit, queueLimit, ...settings } = createDatabaseConfig();
  db = await mysql.createConnection(settings);
  const sql = await readFile(
    new URL("./migrations/002_inventory.sql", import.meta.url),
    "utf8",
  );
  for (const statement of sql.split(";").filter((s) => s.trim()))
    await db.query(statement);
  console.log("Inventory schema ready; existing jobs unchanged.");
} catch {
  console.error(
    "Inventory migration failed. Inspect database availability and permissions.",
  );
  process.exitCode = 1;
} finally {
  if (db) await db.end();
}
