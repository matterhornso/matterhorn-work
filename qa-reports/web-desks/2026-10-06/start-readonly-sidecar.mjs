import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createBittensorSidecarServer } from "../../../packages/bittensor-subtensor-sidecar/index.mjs";

const root = process.env.BITTENSOR_QA_ROOT;
if (!root?.startsWith("/private/tmp/matterhorn-bittensor-qa.")) throw new Error("Expected an isolated Bittensor QA root.");
if (process.env.READ_ONLY !== "1" || process.env.BITTENSOR_SIDECAR_MODE !== "python" || process.env.BITTENSOR_SIDECAR_HOST !== "127.0.0.1") {
  throw new Error("This QA launcher requires read-only Python mode on loopback.");
}
const server = createBittensorSidecarServer();
server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Sidecar did not bind a TCP loopback listener.");
  const metadata = { pid: process.pid, root, url: `http://127.0.0.1:${address.port}`, mode: "python", network: process.env.BITTENSOR_NETWORK, startedAt: new Date().toISOString(), status: "process_started_chain_readiness_unverified", submission: "permanently_disabled" };
  writeFileSync(join(root, "sidecar-runtime.json"), `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  console.log(JSON.stringify(metadata));
});
for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => server.close(() => process.exit(0)));
