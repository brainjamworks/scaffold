#!/usr/bin/env node

import { transformAsync } from "@babel/core";
import presetEnv from "@babel/preset-env";
import systemImportTransformer from "babel-plugin-system-import-transformer";
import transformAmdLazy from "babel-plugin-transform-es2015-modules-amd-lazy";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { minify } from "terser";

export async function buildAmdModules({ component, outputRoot, sourceRoot }) {
  const entries = (await readdir(sourceRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
    .sort((left, right) => left.name.localeCompare(right.name));

  if (entries.length === 0) {
    throw new Error(`No Moodle AMD source modules found in ${sourceRoot}.`);
  }

  await rm(outputRoot, { force: true, recursive: true });
  await mkdir(outputRoot, { recursive: true });

  for (const entry of entries) {
    const sourcePath = resolve(sourceRoot, entry.name);
    const source = await readFile(sourcePath, "utf8");
    const transformed = await transformAsync(source, {
      babelrc: false,
      comments: false,
      configFile: false,
      filename: sourcePath,
      plugins: [transformAmdLazy, systemImportTransformer],
      presets: [[presetEnv, { modules: false, useBuiltIns: false }]],
      sourceMaps: false,
    });
    if (!transformed?.code) {
      throw new Error(`Babel did not emit a Moodle AMD module for ${sourcePath}.`);
    }

    const modulePath = relative(sourceRoot, sourcePath).replaceAll("\\", "/").replace(/\.js$/, "");
    const namedModule = transformed.code.replace(
      /(^|\n)define\(/,
      `$1define(${JSON.stringify(`${component}/${modulePath}`)},`,
    );
    if (namedModule === transformed.code) {
      throw new Error(`Babel did not emit an AMD define call for ${sourcePath}.`);
    }

    const minified = await minify(namedModule, {
      format: { comments: false },
      mangle: false,
      sourceMap: false,
    });
    if (!minified.code) {
      throw new Error(`Terser did not emit a minified Moodle AMD module for ${sourcePath}.`);
    }

    const outputName = entry.name.replace(/\.js$/, ".min.js");
    await writeFile(resolve(outputRoot, outputName), `${minified.code}\n`, "utf8");
  }

  return entries.length;
}

async function main() {
  const adapterRoot = fileURLToPath(new URL("..", import.meta.url));
  const sourceRoot = resolve(adapterRoot, "scaffold", "amd", "src");
  const outputRoot = resolve(adapterRoot, "scaffold", "amd", "build");
  const count = await buildAmdModules({
    component: "mod_scaffold",
    outputRoot,
    sourceRoot,
  });
  console.log(`Built ${count} Moodle AMD module${count === 1 ? "" : "s"} in ${outputRoot}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
