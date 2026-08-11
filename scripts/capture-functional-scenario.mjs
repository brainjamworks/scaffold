import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCENARIOS_DIRECTORY = resolve(REPOSITORY_ROOT, ".qa/scenarios");
const ARTIFACTS_DIRECTORY = resolve(REPOSITORY_ROOT, "test-results/functional-captures");
const VIDEO_ARTIFACTS_DIRECTORY = "/tmp/opencode-functional-captures";
const DEFAULT_VIEWPORT = { width: 1440, height: 900 };
const SUPPORTED_ACTIONS = new Set([
  "click",
  "fill",
  "press",
  "wait-for",
  "select-option",
  "check",
  "uncheck",
  "screenshot",
  "expect-text",
]);
const coreRequire = createRequire(new URL("../packages/core/package.json", import.meta.url));

export function parseCaptureArguments(args) {
  const normalizedArgs = args[0] === "--" ? args.slice(1) : args;
  if (normalizedArgs.length !== 2 || normalizedArgs[0] !== "--scenario") {
    throw new Error("Usage: vp run qa:capture -- --scenario .qa/scenarios/<scenario>.json");
  }

  const scenarioPath = normalizedArgs[1];
  if (!scenarioPath) throw new Error("--scenario requires a path.");
  assertScenarioPath(scenarioPath);
  return { scenarioPath };
}

export function validateScenario(input) {
  if (!isRecord(input)) throw new Error("Scenario must be a JSON object.");
  if (typeof input.name !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(input.name)) {
    throw new Error("Scenario name must contain lowercase letters, numbers, and hyphens.");
  }
  assertLoopbackUrl(input.url);
  if (!Array.isArray(input.steps)) throw new Error("Scenario steps must be an array.");

  const viewport = input.viewport ?? DEFAULT_VIEWPORT;
  if (
    !isRecord(viewport) ||
    !Number.isInteger(viewport.width) ||
    !Number.isInteger(viewport.height) ||
    viewport.width < 320 ||
    viewport.height < 240
  ) {
    throw new Error("Scenario viewport must have integer width and height of at least 320×240.");
  }

  const steps = input.steps.map(validateStep);
  return { name: input.name, url: input.url, viewport, steps };
}

async function loadScenario(scenarioPath) {
  const absolutePath = assertScenarioPath(scenarioPath);
  let parsed;
  try {
    parsed = JSON.parse(await readFile(absolutePath, "utf8"));
  } catch (error) {
    throw new Error(`Could not read scenario ${scenarioPath}: ${error.message}`);
  }
  return validateScenario(parsed);
}

async function captureScenario(scenario) {
  const { artifactDirectory, screenshotsDirectory, videoDirectory, tracePath } = createArtifactPaths(scenario.name);
  await Promise.all([mkdir(screenshotsDirectory, { recursive: true }), mkdir(videoDirectory, { recursive: true })]);

  const { chromium } = coreRequire("playwright");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: scenario.viewport,
    recordVideo: { dir: videoDirectory, size: scenario.viewport },
  });
  const page = await context.newPage();
  const video = page.video();
  let failure;

  try {
    await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
    await page.goto(scenario.url, { waitUntil: "networkidle" });
    for (const [index, step] of scenario.steps.entries()) {
      await runStep(page, step, screenshotsDirectory, index + 1);
    }
    await page.screenshot({ path: resolve(screenshotsDirectory, "final.png"), fullPage: true });
  } catch (error) {
    failure = error;
    await page.screenshot({ path: resolve(screenshotsDirectory, "failure.png"), fullPage: true }).catch(() => {});
  } finally {
    await context.tracing.stop({ path: tracePath }).catch(() => {});
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  const videoPath = video ? await video.path() : undefined;
  const report = { artifactDirectory, videoPath, tracePath, screenshotsDirectory };
  if (failure) {
    const captureError = new Error(failure.message);
    captureError.report = report;
    throw captureError;
  }
  return report;
}

async function runStep(page, step, screenshotsDirectory, index) {
  if (step.action === "click") return page.locator(step.selector).click();
  if (step.action === "fill") return page.locator(step.selector).fill(step.value);
  if (step.action === "press") return page.locator(step.selector).press(step.key);
  if (step.action === "wait-for") return page.locator(step.selector).waitFor({ state: "visible" });
  if (step.action === "select-option") return page.locator(step.selector).selectOption(step.value);
  if (step.action === "check") return page.locator(step.selector).check();
  if (step.action === "uncheck") return page.locator(step.selector).uncheck();
  if (step.action === "expect-text") return page.locator(step.selector).getByText(step.text, { exact: false }).waitFor();
  if (step.action === "screenshot") {
    return page.screenshot({ path: resolve(screenshotsDirectory, `${String(index).padStart(2, "0")}-${step.name}.png`), fullPage: true });
  }
  throw new Error(`Unsupported scenario action ${JSON.stringify(step.action)}.`);
}

function validateStep(step) {
  if (!isRecord(step) || typeof step.action !== "string" || !SUPPORTED_ACTIONS.has(step.action)) {
    throw new Error(`Unsupported scenario action ${JSON.stringify(step?.action)}.`);
  }
  if (step.action === "screenshot") {
    if (typeof step.name !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(step.name)) {
      throw new Error("Screenshot actions require a lowercase filename-safe name.");
    }
    return { action: step.action, name: step.name };
  }
  if (typeof step.selector !== "string" || step.selector.length === 0) {
    throw new Error(`${step.action} actions require a selector.`);
  }
  if (["fill", "select-option"].includes(step.action) && typeof step.value !== "string") {
    throw new Error(`${step.action} actions require a string value.`);
  }
  if (step.action === "press" && typeof step.key !== "string") {
    throw new Error("press actions require a key.");
  }
  if (step.action === "expect-text" && typeof step.text !== "string") {
    throw new Error("expect-text actions require text.");
  }
  return step;
}

function assertScenarioPath(scenarioPath) {
  const absolutePath = resolve(REPOSITORY_ROOT, scenarioPath);
  const pathFromScenarioDirectory = relative(SCENARIOS_DIRECTORY, absolutePath);
  if (pathFromScenarioDirectory.startsWith("..") || pathFromScenarioDirectory === "" || !absolutePath.endsWith(".json")) {
    throw new Error("Scenario must be a JSON file under .qa/scenarios.");
  }
  return absolutePath;
}

function assertLoopbackUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Scenario URL must be a valid loopback URL.");
  }
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error("Scenario URL must be an http loopback URL.");
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function timestamp(now = new Date()) {
  return now.toISOString().replaceAll(":", "-").replace(".", "-");
}

export function createArtifactPaths(name, now = new Date()) {
  const runName = `${name}-${timestamp(now)}`;
  const artifactDirectory = resolve(ARTIFACTS_DIRECTORY, runName);
  return {
    artifactDirectory,
    screenshotsDirectory: resolve(artifactDirectory, "screenshots"),
    tracePath: resolve(artifactDirectory, "trace.zip"),
    videoDirectory: resolve(VIDEO_ARTIFACTS_DIRECTORY, runName),
  };
}

function printReport(result, status) {
  console.log(`RESULT: ${status}`);
  console.log(`artifacts: ${result.artifactDirectory}`);
  console.log(`video: ${result.videoPath ?? "NOT_CREATED"}`);
  console.log(`trace: ${result.tracePath}`);
  console.log(`screenshots: ${result.screenshotsDirectory}`);
}

async function main() {
  try {
    const { scenarioPath } = parseCaptureArguments(process.argv.slice(2));
    printReport(await captureScenario(await loadScenario(scenarioPath)), "PASS");
  } catch (error) {
    if (error.report) printReport(error.report, "FAIL");
    console.error(`qa:capture: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) void main();
