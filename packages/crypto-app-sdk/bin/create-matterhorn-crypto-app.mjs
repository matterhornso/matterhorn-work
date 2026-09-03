#!/usr/bin/env node

import { runMatterhornCryptoAppQuickstartCli } from "../dist/node-quickstart.js";

process.exitCode = runMatterhornCryptoAppQuickstartCli(process.argv.slice(2));
