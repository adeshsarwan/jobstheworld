import { inventoryOperation } from "./runtime.js";
try {
  console.log(JSON.stringify(await inventoryOperation("daily")));
} catch {
  console.error(
    "Inventory evaluation failed; check migrations, configuration and database access.",
  );
  process.exitCode = 1;
}
