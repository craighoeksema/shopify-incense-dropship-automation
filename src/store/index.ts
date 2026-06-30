import type { RuntimeConfig } from "../types.js";
import { FileAutomationStore } from "./file.js";
import { MemoryAutomationStore } from "./memory.js";
import { PostgresAutomationStore } from "./postgres.js";
import type { AutomationStore } from "./store.js";

export async function createStore(config: RuntimeConfig): Promise<AutomationStore> {
  if (config.store.driver === "memory") return new MemoryAutomationStore();
  if (config.store.driver === "file") return new FileAutomationStore(config.store.filePath);

  if (!config.store.databaseUrl) {
    throw new Error("DATABASE_URL is required when STORE_DRIVER=postgres");
  }

  const store = new PostgresAutomationStore(config.store.databaseUrl);
  if (config.store.postgresAutoMigrate) {
    await store.migrate();
  }
  return store;
}

export type { AutomationStore } from "./store.js";
