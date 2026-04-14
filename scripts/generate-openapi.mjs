#!/usr/bin/env node
/**
 * Generate openapi.json for this Beeable app.
 *
 * Apps own their entire HTTP surface — every public operation is a
 * deliberate route in `server/routes.js` with an `@openapi` JSDoc
 * block above it. This script extracts those blocks, parses their
 * YAML body, and writes the result to `openapi.json`.
 *
 * Usage:
 *   npm run build:api
 *   # or
 *   node scripts/generate-openapi.mjs
 *
 * The output (`openapi.json`) is committed to the repo so consumers
 * (the orchestrator, other apps, the deploy validator) don't have to
 * run a build step to read it.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── Helpers ────────────────────────────────────────────────────────

async function readJson(path) {
  const raw = await readFile(path, 'utf-8');
  return JSON.parse(raw);
}

/**
 * Extract every `@openapi` JSDoc block from a file's source. Each block
 * looks like:
 *
 *   /**
 *    * @openapi
 *    * path: /foo
 *    * method: get
 *    * ...
 *    *\/
 *
 * Returns an array of `{ path, method, ...operation }` objects parsed
 * from the YAML body.
 */
function extractOpenApiBlocks(source) {
  const blocks = [];
  // Match /** ... @openapi ... */ comment blocks
  const re = /\/\*\*\s*\n([\s\S]*?)\*\//g;
  let match;
  while ((match = re.exec(source)) !== null) {
    const body = match[1];
    if (!/^\s*\*\s*@openapi\b/m.test(body)) continue;

    // Strip the leading ` * ` from each line and drop the `@openapi` marker line
    const yamlLines = body
      .split('\n')
      .map((line) => line.replace(/^\s*\*\s?/, ''))
      .filter((line) => !/^\s*@openapi\b/.test(line));
    const yamlText = yamlLines.join('\n');

    let parsed;
    try {
      parsed = yaml.load(yamlText);
    } catch (err) {
      throw new Error(`Failed to parse @openapi YAML block: ${err.message}\n--- block ---\n${yamlText}\n---`);
    }
    if (!parsed || typeof parsed !== 'object') continue;
    if (!parsed.path || !parsed.method) {
      throw new Error(`@openapi block missing required 'path' or 'method':\n${yamlText}`);
    }
    blocks.push(parsed);
  }
  return blocks;
}

/**
 * Take a JSDoc-extracted block ({ path, method, ...op }) and merge it
 * into the spec's `paths` object. Throws if the same (path, method)
 * pair has already been registered — that catches typos before they
 * silently overwrite each other.
 */
function mergeCustomOperation(paths, block) {
  const { path, method, ...operation } = block;
  const pathItem = paths[path] ?? (paths[path] = {});
  const verb = String(method).toLowerCase();
  if (pathItem[verb]) {
    throw new Error(`Duplicate operation: ${verb.toUpperCase()} ${path}`);
  }
  pathItem[verb] = operation;
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  const manifest = await readJson(join(ROOT, 'manifest.json'));
  const routesSource = await readFile(join(ROOT, 'server', 'routes.js'), 'utf-8');

  const paths = {};

  // Custom routes from JSDoc @openapi blocks — every public operation.
  const blocks = extractOpenApiBlocks(routesSource);
  for (const block of blocks) {
    mergeCustomOperation(paths, block);
  }

  const spec = {
    openapi: '3.0.3',
    info: {
      title: `${manifest.displayName ?? manifest.name} API`,
      description: `HTTP API exposed by the ${manifest.displayName ?? manifest.name} Beeable app. Endpoints are extracted from JSDoc @openapi blocks in server/routes.js — every public operation is declared explicitly.`,
      version: '1.0.0',
    },
    paths,
  };

  const out = JSON.stringify(spec, null, 2) + '\n';
  await writeFile(join(ROOT, 'openapi.json'), out, 'utf-8');

  console.log(`Wrote openapi.json — ${blocks.length} operation(s)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
