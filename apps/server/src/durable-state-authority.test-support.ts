import { MatterhornDurableStateAuthority } from "./durable-state-authority.js";

const TEST_SECRET = "matterhorn-test-durable-state-authority-secret-64-bytes-long-value";

export function testDurableStateAuthority(secret = TEST_SECRET): MatterhornDurableStateAuthority {
  return new MatterhornDurableStateAuthority(secret);
}
