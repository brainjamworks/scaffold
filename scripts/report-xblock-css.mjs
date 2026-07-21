import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";

import postcss from "postcss";

const ROOT = new URL("..", import.meta.url).pathname;
const PUBLIC_DIR = join(ROOT, "adapters/xblock/scaffold_xblock/public");
const LEGACY_CSS_FILE = join(PUBLIC_DIR, "scaffold-xblock.css");

if (!existsSync(PUBLIC_DIR)) {
  console.error(`XBlock public directory not found: ${PUBLIC_DIR}`);
  console.error("Run: pnpm --filter @scaffold/adapter-xblock build");
  process.exit(1);
}

const cssFiles = findXBlockCssFiles();

if (cssFiles.length === 0) {
  console.error(`XBlock CSS asset not found in: ${PUBLIC_DIR}`);
  console.error("Run: pnpm --filter @scaffold/adapter-xblock build");
  process.exit(1);
}

const css = cssFiles
  .map((file) => {
    const relativeFile = relative(ROOT, file);
    return `\n/* ${relativeFile} */\n${readFileSync(file, "utf8")}`;
  })
  .join("\n");
const root = postcss.parse(css, { from: cssFiles[0] });
const families = new Map();
let classifiedRawBytes = 0;

root.walk((node) => {
  if (!isReportableNode(node)) return;

  const cssText = node.toString();
  const rawBytes = Buffer.byteLength(cssText);
  classifiedRawBytes += rawBytes;

  const family = classifyNode(node, cssText);
  const summary = summarizeNode(node);
  const bucket = families.get(family) ?? {
    family,
    rawBytes: 0,
    cssParts: [],
    samples: [],
    count: 0,
  };

  bucket.rawBytes += rawBytes;
  bucket.cssParts.push(cssText);
  bucket.count += 1;
  addSample(bucket.samples, {
    rawBytes,
    summary,
  });
  families.set(family, bucket);
});

const fileRawBytes = Buffer.byteLength(css);
const fileGzipBytes = gzipSync(css).byteLength;
const rows = [...families.values()]
  .map((family) => ({
    ...family,
    gzipBytes: gzipSync(family.cssParts.join("\n")).byteLength,
  }))
  .sort((a, b) => b.rawBytes - a.rawBytes || a.family.localeCompare(b.family));

console.log("XBlock CSS attribution");
if (cssFiles.length === 1) {
  console.log(`File: ${relative(ROOT, cssFiles[0])}`);
} else {
  console.log("Files:");
  for (const file of cssFiles) {
    console.log(`- ${relative(ROOT, file)}`);
  }
}
console.log(`Raw: ${formatBytes(fileRawBytes)}`);
console.log(`Gzip: ${formatBytes(fileGzipBytes)}`);
console.log("");
console.log("| Family | Rules | Raw | Approx gzip | Raw share |");
console.log("|---|---:|---:|---:|---:|");
for (const row of rows) {
  console.log(
    `| ${row.family} | ${row.count} | ${formatBytes(row.rawBytes)} | ${formatBytes(
      row.gzipBytes,
    )} | ${formatPercent(row.rawBytes / fileRawBytes)} |`,
  );
}

const overheadBytes = Math.max(0, fileRawBytes - classifiedRawBytes);
if (overheadBytes > 0) {
  console.log(
    `| parser/at-rule wrapper overhead | - | ${formatBytes(overheadBytes)} | - | ${formatPercent(
      overheadBytes / fileRawBytes,
    )} |`,
  );
}

console.log("");
console.log("Representative large selectors");
for (const row of rows.slice(0, 12)) {
  console.log("");
  console.log(`### ${row.family}`);
  for (const sample of row.samples) {
    console.log(`- ${formatBytes(sample.rawBytes)}: ${sample.summary}`);
  }
}

function isReportableNode(node) {
  if (node.type === "rule") return true;
  if (node.type !== "atrule") return false;
  if (node.name === "import") return true;
  if (node.name === "font-face") return true;
  return !node.nodes;
}

function findXBlockCssFiles() {
  if (existsSync(LEGACY_CSS_FILE)) return [LEGACY_CSS_FILE];

  const cssFiles = [];
  walk(PUBLIC_DIR, (file) => {
    if (file.endsWith(".css")) cssFiles.push(file);
  });

  return cssFiles.sort((a, b) => relative(ROOT, a).localeCompare(relative(ROOT, b)));
}

function walk(path, visit) {
  const stats = statSync(path);
  if (stats.isDirectory()) {
    for (const entry of readdirSync(path)) {
      walk(join(path, entry), visit);
    }
    return;
  }

  if (stats.isFile()) visit(path);
}

function classifyNode(node, cssText) {
  const selector = node.type === "rule" ? node.selector : "";
  const haystack = `${selector}\n${cssText}`;

  if (node.type === "atrule" && node.name === "import") {
    if (haystack.includes("fonts.googleapis.com")) return "font:google-import";
    return "css:other-import";
  }

  if (node.type === "atrule" && node.name === "font-face") {
    if (/font-display:"swap"/.test(haystack)) {
      return "third-party:mathlive-fonts";
    }
    if (/KaTeX|katex/.test(haystack)) return "third-party:katex-fonts";
  }

  if (/ML__|mathlive|math-field|MathfieldElement/.test(haystack)) {
    return "third-party:mathlive-rules";
  }
  if (/KaTeX|katex/.test(haystack)) return "third-party:katex-rules";
  if (/react-pdf|annotationLayer|textLayer/.test(haystack)) {
    return "third-party:react-pdf";
  }
  if (/revo|revogr/i.test(haystack)) return "third-party:revo-grid";
  if (/sc-xblock|scaffold-xblock|xblock/i.test(haystack)) {
    return "adapter:xblock";
  }
  if (/\.sc-|sc-/.test(haystack)) return "scaffold:component-css";
  if (
    /ProseMirror|tiptap|data-node-view|data-runtime-frame|data-authoring-frame|data-authoring-chrome|data-selection/.test(
      haystack,
    )
  ) {
    return "scaffold:editor-global";
  }
  if (looksLikeGlobalReset(selector)) return "scaffold:global-reset-and-tokens";
  if (looksLikeUtilitySelector(selector)) return "legacy:utility-selector";

  return "other";
}

function looksLikeGlobalReset(selector) {
  if (!selector) return false;
  return /^(html|body|:root|\*|::|:host|::-)/.test(selector);
}

function looksLikeUtilitySelector(selector) {
  if (!selector.startsWith(".")) return false;
  if (/\\:|\\\[|\\\]|\\\(|\\\)|\\\/|\\%/.test(selector)) return true;
  if (/\.(group|peer)([\\/:.[\s,{>~#]|$)/.test(selector)) return true;

  return /\.(absolute|relative|fixed|sticky|block|inline-block|inline-flex|flex|grid|contents|hidden|sr-only|w-|h-|min-|max-|p-|px-|py-|pt-|pr-|pb-|pl-|m-|mx-|my-|mt-|mr-|mb-|ml-|gap-|items-|justify-|content-|self-|rounded|border|bg-|text-|font-|leading-|tracking-|opacity-|shadow|outline|ring|z-|overflow-|truncate|whitespace-|transition|duration-|ease-|hover|focus|disabled|data-)/.test(
    selector,
  );
}

function summarizeNode(node) {
  if (node.type === "rule") return truncate(node.selector);
  if (node.type === "atrule") return truncate(`@${node.name} ${node.params}`);
  return truncate(node.toString());
}

function addSample(samples, sample) {
  samples.push(sample);
  samples.sort((a, b) => b.rawBytes - a.rawBytes);
  samples.splice(5);
}

function truncate(value) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 160) return normalized;
  return `${normalized.slice(0, 157)}...`;
}

function formatBytes(bytes) {
  const mib = bytes / 1024 / 1024;
  if (mib >= 1) return `${mib.toFixed(2)} MiB`;
  return `${(bytes / 1024).toFixed(2)} KiB`;
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}
