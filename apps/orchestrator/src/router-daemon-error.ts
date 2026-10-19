export class RouterDaemonRequestError extends Error {
  constructor(readonly code: "invalid_json" | "payload_too_large") {
    super(code);
  }
}

export function routerDaemonErrorResponse(error: unknown): { status: number; error: string } {
  try {
    if (error instanceof RouterDaemonRequestError) {
      if (error.code === "invalid_json") return { status: 400, error: "invalid_json" };
      if (error.code === "payload_too_large") return { status: 413, error: "payload_too_large" };
    }
  } catch {
    // Even an unusual thrown value must not break the safe failure response.
  }
  return { status: 500, error: "router_request_failed" };
}
