import assert from "node:assert/strict";
import { request } from "node:http";
import { createBittensorSidecarServer } from "./index.mjs";

const server = createBittensorSidecarServer();
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;

function post(path, body, chunked = false) {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, method: "POST", headers: {
      "content-type": "application/json",
      ...(chunked ? {} : { "content-length": Buffer.byteLength(body) }),
    } }, res => {
      let text = "";
      res.on("data", chunk => { text += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(text) }));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

try {
  for (const chunked of [false, true]) {
    const result = await post("/extrinsics/quote", JSON.stringify({ padding: "a".repeat(70_000) }), chunked);
    assert.equal(result.status, 413, "body limits apply with and without Content-Length");
  }
  for (const body of ["null", "[]", "1", '"text"', "{"]) {
    assert.equal((await post("/extrinsics/quote", body)).status, 400);
  }
  for (const path of ["/extrinsics/quote", "/extrinsics/prepare", "/submit"]) {
    const result = await post(path, JSON.stringify({ nested: { "secret-sensitive-marker": "test" } }));
    assert.equal(result.status, 400);
    assert.equal(result.body.error, "forbidden_key_material");
    assert.ok(!JSON.stringify(result).includes("sensitive-marker"), "do not reflect untrusted field names");
  }
  const deep = '{"value":'.repeat(80) + "{}" + "}".repeat(80);
  assert.equal((await post("/extrinsics/prepare", deep)).status, 400);
  assert.equal((await fetch(`http://127.0.0.1:${port}/liveness`)).status, 200);
  console.log("Sidecar request bounds and secret rejection: PASS");
} finally {
  server.close();
}
