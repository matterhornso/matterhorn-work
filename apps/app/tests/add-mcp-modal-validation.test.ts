import { describe, expect, test } from "bun:test";

import {
  getMcpAddError,
  validateRemoteMcpUrl,
} from "../src/react-app/domains/connections/modals/add-mcp-modal";

describe("custom MCP URL validation", () => {
  test("accepts HTTP and HTTPS MCP endpoints", () => {
    expect(validateRemoteMcpUrl("https://mcp.example.com/sse")).toBeNull();
    expect(validateRemoteMcpUrl("http://127.0.0.1:8787/mcp")).toBeNull();
  });

  test("rejects missing, malformed, and unsupported URLs", () => {
    expect(validateRemoteMcpUrl("")).toContain("Enter");
    expect(validateRemoteMcpUrl("mcp.example.com")).toContain("valid");
    expect(validateRemoteMcpUrl("file:///tmp/mcp.sock")).toContain("http");
  });

  test("rejects credentials embedded in the URL", () => {
    expect(validateRemoteMcpUrl("https://user:secret@mcp.example.com")).toContain(
      "credentials",
    );
  });

  test("keeps a failed connection recoverable without surfacing internal errors", () => {
    expect(getMcpAddError({ ok: true })).toBeNull();
    expect(getMcpAddError()).toBeNull();
    expect(getMcpAddError({ ok: false, message: "internal service failed" })).toBe(
      "Couldn't add this MCP. Check its URL or command, then try again.",
    );
  });
});
