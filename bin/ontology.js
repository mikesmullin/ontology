#!/usr/bin/env bun

import { run } from '../src/cli/index.js';

await run(process.argv.slice(2));
