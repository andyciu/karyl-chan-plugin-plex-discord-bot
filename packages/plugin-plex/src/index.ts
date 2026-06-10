import { plugin } from "./plugin.js";

async function main(): Promise<void> {
  await plugin.start();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("karyl-plex failed to start:", err);
  process.exit(1);
});