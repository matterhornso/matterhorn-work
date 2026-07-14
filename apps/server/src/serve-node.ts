/**
 * Node.js HTTP adapter for the OpenWork server.
 *
 * Provides a `serve()` function with the same interface as Bun.serve()
 * but backed by `node:http`. This allows the server to run in any Node.js
 * environment (including Electron's main process) without Bun.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Readable } from "node:stream";

export type ServeOptions = {
  hostname: string;
  port: number;
  fetch: (request: Request) => Response | Promise<Response>;
  idleTimeout?: number;
};

export type ServeResult = {
  port: number;
  stop: () => void | Promise<void>;
};

function isResponseWritable(nodeRes: ServerResponse): boolean {
  return !nodeRes.destroyed && !nodeRes.closed && !nodeRes.writableEnded;
}

function isWriteAfterEndError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ERR_STREAM_WRITE_AFTER_END" || error.message.includes("write after end");
}

function endResponse(nodeRes: ServerResponse, chunk?: string): void {
  if (!isResponseWritable(nodeRes)) return;
  nodeRes.end(chunk);
}

async function waitForDrainOrClose(nodeRes: ServerResponse): Promise<void> {
  if (!isResponseWritable(nodeRes)) return;

  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      nodeRes.off("drain", done);
      nodeRes.off("close", done);
      nodeRes.off("error", fail);
    };
    const done = () => {
      cleanup();
      resolve();
    };
    const fail = (error: Error) => {
      cleanup();
      if (isWriteAfterEndError(error)) {
        resolve();
        return;
      }
      reject(error);
    };

    nodeRes.once("drain", done);
    nodeRes.once("close", done);
    nodeRes.once("error", fail);
  });
}

/**
 * Convert a Node.js IncomingMessage into a Web API Request.
 */
function toWebRequest(nodeReq: IncomingMessage, hostname: string, port: number, signal?: AbortSignal): Request {
  const url = `http://${hostname}:${port}${nodeReq.url ?? "/"}`;
  const method = nodeReq.method ?? "GET";
  const headers = new Headers();

  // Node headers can be string | string[] | undefined
  for (const [key, value] of Object.entries(nodeReq.headers)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, value);
    }
  }

  const hasBody = method !== "GET" && method !== "HEAD";

  // Readable.toWeb() returns a Node stream/web ReadableStream which is structurally
  // compatible with the global ReadableStream but TypeScript treats them as distinct.
  const body = hasBody
    ? (Readable.toWeb(nodeReq) as unknown as ReadableStream<Uint8Array>)
    : null;

  return new Request(url, {
    method,
    headers,
    body,
    signal,
    // @ts-expect-error duplex is required for streaming request bodies in Node
    duplex: hasBody ? "half" : undefined,
  });
}

/**
 * Write a Web API Response to a Node.js ServerResponse.
 */
async function writeWebResponse(webRes: Response, nodeRes: ServerResponse): Promise<void> {
  const headersObj: Record<string, string | string[]> = {};
  webRes.headers.forEach((value, key) => {
    const existing = headersObj[key];
    if (existing) {
      headersObj[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
    } else {
      headersObj[key] = value;
    }
  });

  if (!isResponseWritable(nodeRes)) return;

  nodeRes.writeHead(webRes.status, headersObj);

  if (!webRes.body) {
    endResponse(nodeRes);
    return;
  }

  const reader = webRes.body.getReader();
  let downstreamClosed = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!isResponseWritable(nodeRes)) {
        downstreamClosed = true;
        break;
      }
      if (!nodeRes.write(value)) {
        await waitForDrainOrClose(nodeRes);
        if (!isResponseWritable(nodeRes)) {
          downstreamClosed = true;
          break;
        }
      }
    }
  } finally {
    if (downstreamClosed) {
      await reader.cancel("downstream disconnected").catch(() => undefined);
    }
    reader.releaseLock();
    endResponse(nodeRes);
  }
}

/**
 * Start an HTTP server with a Web-standard fetch handler.
 *
 * Interface mirrors Bun.serve() so the caller doesn't need to change.
 */
export function serve(options: ServeOptions): Promise<ServeResult> {
  const { hostname, port, fetch: fetchHandler } = options;
  const activeRequestControllers = new Set<AbortController>();

  const server = createServer(async (nodeReq, nodeRes) => {
    const requestController = new AbortController();
    activeRequestControllers.add(requestController);
    const abortRequest = () => requestController.abort();
    nodeReq.once("aborted", abortRequest);
    nodeRes.once("close", abortRequest);
    nodeRes.on("error", (error) => {
      if (isWriteAfterEndError(error)) {
        console.warn("[serve-node] Ignored response write after end");
        return;
      }
      console.error("[serve-node] Response stream error:", error);
    });

    try {
      const webReq = toWebRequest(nodeReq, hostname, boundPort, requestController.signal);
      const webRes = await fetchHandler(webReq);
      await writeWebResponse(webRes, nodeRes);
    } catch (error) {
      if (requestController.signal.aborted || !isResponseWritable(nodeRes)) return;
      console.error("[serve-node] Unhandled error:", error);
      if (!isResponseWritable(nodeRes)) return;
      if (!nodeRes.headersSent) {
        nodeRes.writeHead(500, { "Content-Type": "application/json" });
      }
      endResponse(nodeRes, JSON.stringify({ error: "internal_error" }));
    } finally {
      nodeReq.off("aborted", abortRequest);
      nodeRes.off("close", abortRequest);
      activeRequestControllers.delete(requestController);
    }
  });

  // Set keep-alive timeout to match Bun's idleTimeout
  if (options.idleTimeout) {
    server.keepAliveTimeout = options.idleTimeout * 1000;
  }

  let boundPort = port;

  return new Promise<ServeResult>((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, hostname, () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        boundPort = addr.port;
      }
      let stopPromise: Promise<void> | null = null;
      resolve({
        port: boundPort,
        stop: () => {
          if (stopPromise) return stopPromise;
          for (const controller of activeRequestControllers) controller.abort();
          stopPromise = new Promise<void>((stopResolve, stopReject) => {
            server.close((error) => {
              if (error) {
                if (String(error).includes("ERR_SERVER_NOT_RUNNING") || String(error).includes("Server is not running")) {
                  stopResolve();
                  return;
                }
                stopReject(error);
                return;
              }
              stopResolve();
            });
            const closeConnections = () => {
              server.closeIdleConnections();
              server.closeAllConnections();
            };
            closeConnections();
            // A response can finish between the first sweep and Node marking its
            // socket idle. Sweep once more on the next turn so shutdown does not
            // wait for the keep-alive timeout.
            setImmediate(closeConnections);
          });
          return stopPromise;
        },
      });
    });
  });
}
