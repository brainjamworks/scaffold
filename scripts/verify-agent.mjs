import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = fileURLToPath(new URL("..", import.meta.url));
const CHECK_COMMANDS = {
  architecture: ["vp", "run", "verify:architecture"],
  artifacts: ["vp", "run", "verify:artifacts"],
  build: ["vp", "run", "verify:build"],
  static: ["vp", "run", "verify:static"],
  tooling: ["vp", "run", "verify:tooling"],
};

export function parseArguments(args) {
  const options = { allow: [], base: "HEAD", checks: [], json: false };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--") continue;
    if (argument === "--allow") {
      const path = args[++index];
      if (!path) throw new Error("--allow requires a repository-relative file or directory path.");
      options.allow.push(normalizePath(path));
      continue;
    }
    if (argument === "--base") {
      const base = args[++index];
      if (!base) throw new Error("--base requires a Git revision.");
      options.base = base;
      continue;
    }
    if (argument === "--check") {
      const check = args[++index];
      if (!CHECK_COMMANDS[check]) {
        throw new Error(`Unknown check ${JSON.stringify(check)}. Use one of: ${Object.keys(CHECK_COMMANDS).join(", ")}.`);
      }
      options.checks.push(check);
      continue;
    }
    if (argument === "--json") {
      options.json = true;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      return { ...options, help: true };
    }
    throw new Error(`Unknown argument ${JSON.stringify(argument)}.`);
  }

  return options;
}

export function evaluateScope(changedFiles, allowedPaths) {
  if (allowedPaths.length === 0) return { status: "NOT_REQUESTED", outsideScope: [] };

  const outsideScope = changedFiles.filter(
    (changedFile) =>
      !allowedPaths.some(
        (allowedPath) => changedFile === allowedPath || changedFile.startsWith(`${allowedPath}/`),
      ),
  );
  return {
    status: outsideScope.length === 0 ? "PASS" : "FAIL",
    outsideScope,
  };
}

function normalizePath(path) {
  return path.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, "");
}

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed.`);
  }
  return result.stdout;
}

function changedFilesSince(base) {
  const tracked = runGit(["diff", "--name-only", "--diff-filter=ACMR", base, "--"]);
  const untracked = runGit(["ls-files", "--others", "--exclude-standard"]);
  return [...new Set(`${tracked}${untracked}`.split("\n").filter(Boolean))].sort();
}

function tail(output) {
  return output.trim().split("\n").slice(-12).join("\n");
}

function runCheck(name) {
  const [command, ...args] = CHECK_COMMANDS[name];
  const result = spawnSync(command, args, {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  const output = `${result.stdout}\n${result.stderr}`;
  return {
    name,
    status: result.status === 0 ? "PASS" : "FAIL",
    failure: result.status === 0 ? undefined : tail(output),
  };
}

function createReport(options) {
  const changedFiles = changedFilesSince(options.base);
  const scope = evaluateScope(changedFiles, options.allow);
  const checks = options.checks.map(runCheck);
  const result =
    scope.status === "FAIL" || checks.some((check) => check.status === "FAIL") ? "FAIL" : "PASS";

  return {
    result,
    base: options.base,
    changedFiles,
    scope,
    checks,
  };
}

function printHumanReport(report) {
  console.log(`RESULT: ${report.result}`);
  console.log(`changed_files: ${report.changedFiles.length}`);
  console.log(`scope: ${report.scope.status}`);
  console.log(`checks: ${report.checks.map(({ name, status }) => `${name}=${status}`).join(", ") || "NOT_REQUESTED"}`);
  if (report.scope.outsideScope.length > 0) {
    console.log(`outside_scope: ${report.scope.outsideScope.join(", ")}`);
  }
  for (const check of report.checks.filter((entry) => entry.status === "FAIL")) {
    console.log(`check_failure:${check.name}: ${check.failure}`);
  }
}

function printHelp() {
  console.log(`Usage: vp run verify:agent -- [options]

Options:
  --allow <path>  Permit an exact repository-relative file or a directory and its descendants. Repeatable.
  --base <ref>     Compare changes against a Git revision (default: HEAD).
  --check <name>   Run one existing check: ${Object.keys(CHECK_COMMANDS).join(", ")}. Repeatable.
  --json           Print the report as JSON.
  --help, -h       Print this help.`);
}

function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      printHelp();
      return;
    }
    const report = createReport(options);
    if (options.json) console.log(JSON.stringify(report, null, 2));
    else printHumanReport(report);
    if (report.result === "FAIL") process.exitCode = 1;
  } catch (error) {
    console.error(`verify:agent: ${error.message}`);
    process.exitCode = 2;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
