import "dotenv/config";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createStore } from "./store/index.js";

const config = loadConfig();
const store = await createStore(config);
const app = createApp({ config, store });

const server = app.listen(config.port, () => {
  console.log(`Shopify dropship automation listening on port ${config.port}`);
});

async function shutdown(): Promise<void> {
  server.close(async () => {
    await store.close();
    process.exit(0);
  });
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
