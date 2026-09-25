import { spawn } from "node:child_process";

// One bounded pool per sidecar, shared by health, cached discovery and direct reads.
export function createPythonBridge({ script, network, spawnProcess = spawn, timeoutMs = 20_000 }) {
  let active = 0;
  return (action, payload) => {
    if (active >= 4) {
      return Promise.reject(Object.assign(new Error("Bittensor service is busy. Retry shortly."), { status: 503 }));
    }
    return new Promise((resolve, reject) => {
      const child = spawnProcess(process.env.BITTENSOR_PYTHON || "python3", [script, action], {
        stdio: ["pipe", "pipe", "ignore"],
        env: { ...process.env, BITTENSOR_NETWORK: network },
      });
      active += 1;
      const chunks = [];
      let bytes = 0;
      let settled = false;
      const fail = (message, status = 502) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.kill("SIGKILL");
        reject(Object.assign(new Error(message), { status }));
      };
      const timer = setTimeout(() => fail("Bittensor chain read timed out. Retry shortly.", 504), timeoutMs);
      child.stdout.on("data", data => {
        if (settled) return;
        bytes += data.length;
        if (bytes > 4 * 1024 * 1024) {
          fail("Bittensor chain response exceeded the supported size.");
          return;
        }
        chunks.push(data);
      });
      child.once("error", () => fail("Python Bittensor bridge could not start. Check BITTENSOR_PYTHON."));
      child.stdin.on("error", () => fail("Python Bittensor bridge input failed."));
      // 'close', unlike 'exit', fires after stdout is fully drained. Keep the pool
      // slot until then, including after a timeout or oversized response.
      child.once("close", code => {
        active -= 1;
        clearTimeout(timer);
        if (settled) return;
        if (code !== 0) {
          fail("Bittensor chain read failed. Check the sidecar configuration.");
          return;
        }
        try {
          const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          settled = true;
          resolve(value);
        } catch {
          fail("Python Bittensor bridge returned invalid JSON.");
        }
      });
      child.stdin.end(JSON.stringify(payload));
    });
  };
}
