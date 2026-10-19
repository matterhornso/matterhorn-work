function sendJsonResponse(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

// Kept independent of Electron so the actual HTTP boundary can be exercised
// without launching a window or touching the user's desktop profile.
export function createUiControlRequestHandler({ appName, isAuthorized, readBody, runCommand }) {
  return async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/health") {
        sendJsonResponse(response, 200, { ok: true, app: appName, version: 1 });
        return;
      }
      if (!isAuthorized(request)) {
        sendJsonResponse(response, 401, { ok: false, error: "Unauthorized" });
        return;
      }
      if (request.method === "GET" && url.pathname === "/snapshot") {
        sendJsonResponse(response, 200, await runCommand("snapshot"));
        return;
      }
      if (request.method === "GET" && url.pathname === "/actions") {
        sendJsonResponse(response, 200, await runCommand("actions"));
        return;
      }
      if (request.method === "POST" && url.pathname === "/execute") {
        sendJsonResponse(response, 200, await runCommand("execute", await readBody(request)));
        return;
      }
      sendJsonResponse(response, 404, { ok: false, error: "Not found" });
    } catch {
      // Window/renderer/JSON failures can include local paths, credentials or
      // arbitrary thrown objects. Never serialize or inspect them for HTTP.
      sendJsonResponse(response, 500, {
        ok: false,
        error: "Could not complete this UI control request.",
        code: "ui_control_failed",
      });
    }
  };
}
