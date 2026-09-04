#!/usr/bin/env bun
import { runMatterhornCryptoAppQuickstartCli } from "../packages/crypto-app-sdk/src/node-quickstart.js";

process.exitCode = runMatterhornCryptoAppQuickstartCli(
  process.argv.slice(2),
  undefined,
  "pnpm create:crypto-app --",
);
