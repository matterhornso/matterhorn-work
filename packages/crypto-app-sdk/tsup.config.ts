import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "json-schema": "src/json-schema.ts",
    "node-quickstart": "src/node-quickstart.ts",
  },
  tsconfig: "./tsconfig.json",
  format: ["esm"],
  dts: {
    resolve: [/^@matterhorn-work\/types(?:\/.*)?$/],
    tsconfig: "./tsconfig.json",
  },
  clean: true,
  target: "node20",
  platform: "node",
  sourcemap: false,
  splitting: false,
  treeshake: true,
  noExternal: [/^@matterhorn-work\/types(?:\/.*)?$/],
});
