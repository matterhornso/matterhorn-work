import { describe, expect, test } from "bun:test";

import { uploadBlobToWalrus, WalrusUploadError } from "./walrus-storage.js";

function fetchStub(
  fn: (url: string | URL | Request, init?: RequestInit) => Promise<Response>,
): typeof fetch {
  return fn as unknown as typeof fetch;
}

function okWalrusResponse(blobId = "blob_test_123") {
  return {
    newlyCreated: {
      blobObject: {
        id: "0xblobobject",
        blobId,
        storage: { endEpoch: 42 },
      },
    },
  };
}

describe("Walrus storage connector", () => {
  test("rejects unsupported NFT media content types before a public upload", async () => {
    const calls: string[] = [];
    await expect(uploadBlobToWalrus({
      publisherUrl: "https://publisher.example.test",
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "application/json",
      fetchImpl: fetchStub(async () => {
        calls.push("called");
        return Response.json(okWalrusResponse());
      }),
    })).rejects.toMatchObject({
      code: "walrus_unsupported_content_type",
      status: 415,
    });
    expect(calls).toEqual([]);
  });

  test("rejects oversized blobs before a public upload", async () => {
    const calls: string[] = [];
    await expect(uploadBlobToWalrus({
      publisherUrl: "https://publisher.example.test",
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "image/png",
      maxBytes: 2,
      fetchImpl: fetchStub(async () => {
        calls.push("called");
        return Response.json(okWalrusResponse());
      }),
    })).rejects.toMatchObject({
      code: "walrus_blob_too_large",
      status: 413,
    });
    expect(calls).toEqual([]);
  });

  test("rejects checksum mismatches before a public upload", async () => {
    const calls: string[] = [];
    await expect(uploadBlobToWalrus({
      publisherUrl: "https://publisher.example.test",
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "image/png",
      expectedSha256: "0".repeat(64),
      fetchImpl: fetchStub(async () => {
        calls.push("called");
        return Response.json(okWalrusResponse());
      }),
    })).rejects.toMatchObject({
      code: "walrus_blob_integrity_mismatch",
      status: 409,
    });
    expect(calls).toEqual([]);
  });

  test("times out stalled publisher uploads", async () => {
    await expect(uploadBlobToWalrus({
      publisherUrl: "https://publisher.example.test",
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "image/png",
      timeoutMs: 5,
      fetchImpl: fetchStub((_url, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      })),
    })).rejects.toMatchObject({
      code: "walrus_upload_timeout",
      status: 504,
    });
  });

  test("uploads bounded image bytes and derives a public relay URL", async () => {
    const result = await uploadBlobToWalrus({
      publisherUrl: "https://publisher.example.test/base",
      aggregatorUrl: "https://relay.example.test/root",
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "image/png",
      fetchImpl: fetchStub(async () => Response.json(okWalrusResponse("blob_test_456"))),
      now: () => new Date("2026-07-08T00:00:00.000Z"),
    });

    expect(result).toMatchObject({
      blobId: "blob_test_456",
      objectId: "0xblobobject",
      endEpoch: 42,
      responseKind: "newly_created",
      url: "https://relay.example.test/root/v1/blobs/blob_test_456",
      uploadedAt: "2026-07-08T00:00:00.000Z",
    });
  });

  test("uses bounded publisher error bodies", async () => {
    await expect(uploadBlobToWalrus({
      publisherUrl: "https://publisher.example.test",
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "image/png",
      fetchImpl: fetchStub(async () => new Response(JSON.stringify({ message: "x".repeat(5000) }), { status: 502 })),
    })).rejects.toBeInstanceOf(WalrusUploadError);
  });
});
