import type { Worker } from "node:worker_threads";

// Register before sending work so a fast natural exit cannot be missed.
export function trackFixtureWorker(worker: Worker) {
  let exitCode: number | undefined;
  const exited = new Promise<number>((resolve) => {
    worker.once("exit", (code: number) => {
      exitCode = code;
      resolve(code);
    });
  });
  return {
    async waitForExit() {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const code = await Promise.race([
          exited,
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("Fixture worker did not exit after reporting its result")), 1000);
          }),
        ]);
        if (code !== 0) throw new Error(`Fixture worker exited with code ${code}`);
      } finally {
        clearTimeout(timer);
      }
    },
    async stop() {
      // Happy paths finish naturally; termination is only a failure fallback.
      if (exitCode === undefined) await worker.terminate();
    },
  };
}
