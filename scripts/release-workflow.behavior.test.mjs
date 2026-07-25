import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { parse as parseYaml } from "yaml";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RELEASE_WORKFLOW = loadWorkflow(".github/workflows/release.yml");
const APPROVAL_WORKFLOW = loadWorkflow(".github/workflows/approve-release.yml");
const PYPI_WORKFLOW = loadWorkflow(".github/workflows/publish-pypi.yml");
const VERSION = "0.1.0";
const TAG = `v${VERSION}`;
const TAG_OBJECT = "a".repeat(40);
const RELEASE_COMMIT = "b".repeat(40);
const ASSET_NAMES = [
  `mod_scaffold-${VERSION}.zip`,
  `scaffold_xblock-${VERSION}-py3-none-any.whl`,
  `scaffold_xblock-${VERSION}.tar.gz`,
  "SHA256SUMS",
  `scaffold-${VERSION}-provenance.jsonl`,
];

function loadWorkflow(relativePath) {
  return parseYaml(readFileSync(resolve(REPOSITORY_ROOT, relativePath), "utf8"));
}

function workflowStep(workflow, jobName, stepName) {
  const step = workflow.jobs[jobName].steps.find((candidate) => candidate.name === stepName);
  assert.ok(step?.run, `missing executable workflow step: ${stepName}`);
  return step.run;
}

function makeWorkspace(t, prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const runnerTemp = join(root, "runner-temp");
  const bin = join(root, "bin");
  mkdirSync(runnerTemp);
  mkdirSync(bin);
  return { bin, root, runnerTemp };
}

function writeExecutable(path, source) {
  writeFileSync(path, source);
  chmodSync(path, 0o755);
}

function installMockCurl(bin) {
  writeExecutable(
    join(bin, "curl"),
    `#!/usr/bin/env bash
set -euo pipefail
output=""
while (( $# > 0 )); do
  case "$1" in
    --output)
      output="$2"
      shift 2
      ;;
    --write-out)
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done
test -n "$output"
cp "$MOCK_CURL_BODY" "$output"
printf '%s' "$MOCK_CURL_STATUS"
`,
  );
}

function installMockGh(bin) {
  writeExecutable(
    join(bin, "gh"),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$MOCK_GH_LOG"

if [[ "$1" == "api" ]]; then
  arguments="$*"
  if [[ "$arguments" == *"/git/ref/tags/"* ]]; then
    printf '{"ref":"refs/tags/%s","object":{"type":"tag","sha":"%s"}}\\n' \
      "$RELEASE_TAG" "$MOCK_TAG_OBJECT"
  elif [[ "$arguments" == *"/git/tags/"* ]]; then
    printf '{"tag":"%s","object":{"type":"commit","sha":"%s"}}\\n' \
      "$RELEASE_TAG" "$MOCK_RELEASE_COMMIT"
  elif [[ "$arguments" == *"/releases/tags/"* ]]; then
    cat "$MOCK_RELEASE_JSON"
  elif [[ "$arguments" == *"/immutable-releases"* ]]; then
    printf '{}\\n'
  elif [[ "$arguments" == *"/releases/"* && "$arguments" == *"--method PATCH"* ]]; then
    printf '{}\\n'
  else
    echo "unexpected gh api invocation: $arguments" >&2
    exit 1
  fi
  exit 0
fi

if [[ "$1" == "release" && "$2" == "download" ]]; then
  pattern=""
  destination=""
  shift 2
  while (( $# > 0 )); do
    case "$1" in
      --pattern)
        pattern="$2"
        shift 2
        ;;
      --dir)
        destination="$2"
        shift 2
        ;;
      --repo)
        shift 2
        ;;
      *)
        shift
        ;;
    esac
  done
  test -n "$destination"
  mkdir -p "$destination"
  if [[ -n "$pattern" ]]; then
    cp "$MOCK_ASSET_DIR/$pattern" "$destination/$pattern"
  else
    cp "$MOCK_ASSET_DIR"/* "$destination/"
  fi
  exit 0
fi

if [[ "$1" == "release" && "$2" == "create" ]]; then
  test -n "\${GH_REPO:-}"
  test ! -d .git
  exit 0
fi

if [[ "$1" == "release" && "$2" == "edit" ]]; then
  if [[ " $* " == *" --notes-file "* ]]; then
    echo "retry attempted to replace reviewed release notes" >&2
    exit 1
  fi
  exit 0
fi

if [[ "$1" == "release" && "$2" == "upload" ]]; then
  exit 0
fi

if [[ "$1" == "attestation" && "$2" == "verify" ]]; then
  exit 0
fi

echo "unexpected gh invocation: $*" >&2
exit 1
`,
  );
}

function installMockSourceCiGh(bin) {
  writeExecutable(
    join(bin, "gh"),
    `#!/usr/bin/env bash
set -euo pipefail
arguments="$*"
if [[ "$arguments" == *"/actions/workflows/ci.yml/runs"* ]]; then
  cat "$MOCK_WORKFLOW_RUNS"
  exit 0
fi
if [[ "$arguments" =~ /actions/runs/([0-9]+)/artifacts ]]; then
  cat "$MOCK_ARTIFACTS_DIR/\${BASH_REMATCH[1]}.json"
  exit 0
fi
echo "unexpected gh invocation: $arguments" >&2
exit 1
`,
  );
}

function runShell(script, { cwd, env }) {
  return spawnSync("bash", ["-c", script], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      ...env,
    },
  });
}

function sourceCiRun(id, event = "push") {
  return {
    id,
    head_sha: RELEASE_COMMIT,
    event,
    status: "completed",
    conclusion: "success",
    path: ".github/workflows/ci.yml",
  };
}

function writeSourceCiFixtures(workspace, runs, artifactsByRun) {
  const artifactsDirectory = join(workspace.root, "artifacts");
  mkdirSync(artifactsDirectory);
  const workflowRuns = join(workspace.root, "workflow-runs.json");
  writeFileSync(workflowRuns, `${JSON.stringify({ workflow_runs: runs })}\n`);
  for (const run of runs) {
    writeFileSync(
      join(artifactsDirectory, `${run.id}.json`),
      `${JSON.stringify({ artifacts: artifactsByRun.get(run.id) ?? [] })}\n`,
    );
  }
  return { artifactsDirectory, workflowRuns };
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

test("release gate selects a successful exact-commit CI run with an unexpired Moodle candidate", (t) => {
  const workspace = makeWorkspace(t, "scaffold-release-source-ci-");
  installMockSourceCiGh(workspace.bin);
  const runs = [sourceCiRun(101), sourceCiRun(102, "workflow_dispatch")];
  const fixtures = writeSourceCiFixtures(
    workspace,
    runs,
    new Map([
      [101, []],
      [
        102,
        [
          {
            id: 5002,
            name: "moodle-plugin-candidate",
            expired: false,
          },
        ],
      ],
    ]),
  );
  const githubOutput = join(workspace.root, "github-output");

  const result = runShell(workflowStep(RELEASE_WORKFLOW, "gate", "Require successful source CI"), {
    cwd: workspace.root,
    env: {
      GH_TOKEN: "test-token",
      GITHUB_OUTPUT: githubOutput,
      GITHUB_REPOSITORY: "brainjamworks/scaffold",
      MOCK_ARTIFACTS_DIR: fixtures.artifactsDirectory,
      MOCK_WORKFLOW_RUNS: fixtures.workflowRuns,
      PATH: `${workspace.bin}:${process.env.PATH}`,
      RELEASE_COMMIT,
      RUNNER_TEMP: workspace.runnerTemp,
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(githubOutput, "utf8"), "ci_run_id=102\n");
});

test("release gate rejects successful CI runs without an unexpired Moodle candidate", (t) => {
  const workspace = makeWorkspace(t, "scaffold-release-missing-candidate-");
  installMockSourceCiGh(workspace.bin);
  const runs = [sourceCiRun(101)];
  const fixtures = writeSourceCiFixtures(
    workspace,
    runs,
    new Map([
      [
        101,
        [
          {
            id: 5001,
            name: "moodle-plugin-candidate",
            expired: true,
          },
        ],
      ],
    ]),
  );

  const result = runShell(workflowStep(RELEASE_WORKFLOW, "gate", "Require successful source CI"), {
    cwd: workspace.root,
    env: {
      GH_TOKEN: "test-token",
      GITHUB_OUTPUT: join(workspace.root, "github-output"),
      GITHUB_REPOSITORY: "brainjamworks/scaffold",
      MOCK_ARTIFACTS_DIR: fixtures.artifactsDirectory,
      MOCK_WORKFLOW_RUNS: fixtures.workflowRuns,
      PATH: `${workspace.bin}:${process.env.PATH}`,
      RELEASE_COMMIT,
      RUNNER_TEMP: workspace.runnerTemp,
    },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /does not have one unexpired Moodle candidate/);
});

test("release staging preserves the exact tested Moodle candidate bytes", (t) => {
  const workspace = makeWorkspace(t, "scaffold-release-stage-candidate-");
  const download = join(workspace.root, "download", VERSION);
  mkdirSync(download, { recursive: true });
  const archive = join(download, ASSET_NAMES[0]);
  writeFileSync(archive, "exact CI-tested Moodle bytes\n");
  writeFileSync(`${archive}.sha256`, `${sha256(archive)}  ${ASSET_NAMES[0]}\n`);

  const result = runShell(
    workflowStep(RELEASE_WORKFLOW, "package", "Stage tested Moodle candidate"),
    {
      cwd: workspace.root,
      env: {
        RELEASE_VERSION: VERSION,
        TESTED_MOODLE_CANDIDATE: join(workspace.root, "download"),
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const staged = join(workspace.root, "dist", "release", VERSION, ASSET_NAMES[0]);
  assert.equal(readFileSync(staged, "utf8"), readFileSync(archive, "utf8"));
  assert.equal(sha256(staged), sha256(archive));
});

function createCandidate(root) {
  const candidate = join(root, "candidate");
  const provenance = join(root, "provenance");
  mkdirSync(candidate);
  mkdirSync(provenance);
  for (const name of ASSET_NAMES.slice(0, 3)) {
    writeFileSync(join(candidate, name), `approved bytes for ${name}\n`);
  }
  writeFileSync(
    join(candidate, "SHA256SUMS"),
    `${ASSET_NAMES.slice(0, 3)
      .map((name) => `${sha256(join(candidate, name))}  ${name}`)
      .join("\n")}\n`,
  );
  writeFileSync(join(provenance, ASSET_NAMES[4]), '{"bundle":"fixture"}\n');
  writeFileSync(join(candidate, "release-notes.md"), "candidate notes\n");
  return { candidate, provenance };
}

function mockEnvironment(workspace, extra = {}) {
  return {
    GH_REPO: "brainjamworks/scaffold",
    GITHUB_API_URL: "https://api.github.test",
    MOCK_ASSET_DIR: join(workspace.root, "candidate"),
    MOCK_GH_LOG: join(workspace.root, "gh.log"),
    MOCK_RELEASE_COMMIT: RELEASE_COMMIT,
    MOCK_RELEASE_JSON: join(workspace.root, "release.json"),
    MOCK_TAG_OBJECT: TAG_OBJECT,
    PATH: `${workspace.bin}:${process.env.PATH}`,
    RELEASE_TAG: TAG,
    RUNNER_TEMP: workspace.runnerTemp,
    ...extra,
  };
}

test("draft creation runs from a non-Git workspace with explicit repository context", (t) => {
  const workspace = makeWorkspace(t, "scaffold-release-create-");
  installMockCurl(workspace.bin);
  installMockGh(workspace.bin);
  createCandidate(workspace.root);
  writeFileSync(join(workspace.root, "release.json"), "{}\n");
  writeFileSync(join(workspace.root, "curl.json"), "{}\n");

  const result = runShell(
    workflowStep(RELEASE_WORKFLOW, "draft", "Create or safely complete the draft"),
    {
      cwd: workspace.root,
      env: mockEnvironment(workspace, {
        EXPECTED_RELEASE_COMMIT: RELEASE_COMMIT,
        EXPECTED_TAG_OBJECT: TAG_OBJECT,
        GH_TOKEN: "test-token",
        MOCK_CURL_BODY: join(workspace.root, "curl.json"),
        MOCK_CURL_STATUS: "404",
        RELEASE_TITLE: `Scaffold ${VERSION}`,
        RELEASE_VERSION: VERSION,
      }),
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(readFileSync(join(workspace.root, "gh.log"), "utf8"), /release create v0\.1\.0/);
});

test("draft retry preserves manually reviewed release notes", (t) => {
  const workspace = makeWorkspace(t, "scaffold-release-retry-");
  installMockCurl(workspace.bin);
  installMockGh(workspace.bin);
  const { candidate } = createCandidate(workspace.root);
  const existingAsset = ASSET_NAMES[0];
  const release = {
    body: [
      "- Moodle smoke test: passed on Moodle 4.5 (clean install)",
      "- Open edX smoke test: passed on Sumac (clean install)",
    ].join("\n"),
    draft: true,
    assets: [{ name: existingAsset }],
  };
  writeFileSync(join(workspace.root, "release.json"), `${JSON.stringify(release)}\n`);

  const result = runShell(
    workflowStep(RELEASE_WORKFLOW, "draft", "Create or safely complete the draft"),
    {
      cwd: workspace.root,
      env: mockEnvironment(workspace, {
        EXPECTED_RELEASE_COMMIT: RELEASE_COMMIT,
        EXPECTED_TAG_OBJECT: TAG_OBJECT,
        GH_TOKEN: "test-token",
        MOCK_ASSET_DIR: candidate,
        MOCK_CURL_BODY: join(workspace.root, "release.json"),
        MOCK_CURL_STATUS: "200",
        RELEASE_TITLE: `Scaffold ${VERSION}`,
        RELEASE_VERSION: VERSION,
      }),
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const log = readFileSync(join(workspace.root, "gh.log"), "utf8");
  assert.match(log, /release edit v0\.1\.0 --draft --prerelease/);
  assert.doesNotMatch(log, /--notes-file/);
});

function createApprovalFixture(t, { pending = false } = {}) {
  const workspace = makeWorkspace(t, "scaffold-release-approval-");
  installMockGh(workspace.bin);
  const { candidate, provenance } = createCandidate(workspace.root);
  cpSync(join(provenance, ASSET_NAMES[4]), join(candidate, ASSET_NAMES[4]));
  const smokeLines = pending
    ? ["- Moodle smoke test: pending", "- Open edX smoke test: pending"]
    : [
        "- Moodle smoke test: passed on Moodle 4.5.7 (clean install)",
        "- Open edX smoke test: passed on Sumac.3 (clean install)",
      ];
  const release = {
    id: 123,
    tag_name: TAG,
    name: `Scaffold ${VERSION}`,
    draft: true,
    prerelease: true,
    published_at: null,
    body: [`- Source commit: \`${RELEASE_COMMIT}\``, ...smokeLines].join("\n"),
    assets: ASSET_NAMES.map((name) => ({ name })),
  };
  writeFileSync(join(workspace.root, "release.json"), `${JSON.stringify(release)}\n`);
  return workspace;
}

test("approval refuses a draft whose host smoke evidence is still pending", (t) => {
  const workspace = createApprovalFixture(t, { pending: true });
  const result = runShell(
    workflowStep(APPROVAL_WORKFLOW, "approve", "Validate evidence and publish the draft"),
    {
      cwd: workspace.root,
      env: mockEnvironment(workspace, { GH_TOKEN: "test-token" }),
    },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /still contain pending smoke tests/);
  assert.doesNotMatch(readFileSync(join(workspace.root, "gh.log"), "utf8"), /--method PATCH/);
});

test("approval publishes only a complete draft bound to its annotated tag", (t) => {
  const workspace = createApprovalFixture(t);
  const result = runShell(
    workflowStep(APPROVAL_WORKFLOW, "approve", "Validate evidence and publish the draft"),
    {
      cwd: workspace.root,
      env: mockEnvironment(workspace, { GH_TOKEN: "test-token" }),
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const log = readFileSync(join(workspace.root, "gh.log"), "utf8");
  assert.equal((log.match(/git\/ref\/tags\/v0\.1\.0/g) ?? []).length, 2);
  assert.match(log, /immutable-releases/);
  assert.match(log, /--method PATCH repos\/brainjamworks\/scaffold\/releases\/123/);
});

function runPypiStage(t, releaseMetadata, status = "200") {
  const workspace = makeWorkspace(t, "scaffold-pypi-stage-");
  installMockCurl(workspace.bin);
  const candidate = join(workspace.runnerTemp, "candidate");
  mkdirSync(candidate);
  const distributions = ASSET_NAMES.slice(1, 3);
  for (const name of distributions) {
    writeFileSync(join(candidate, name), `approved bytes for ${name}\n`);
  }
  const response = join(workspace.root, "pypi.json");
  writeFileSync(response, `${JSON.stringify(releaseMetadata)}\n`);
  const githubOutput = join(workspace.root, "github-output");

  const result = runShell(
    workflowStep(PYPI_WORKFLOW, "publish", "Stage missing PyPI distributions"),
    {
      cwd: workspace.root,
      env: {
        GITHUB_OUTPUT: githubOutput,
        GITHUB_WORKSPACE: workspace.root,
        MOCK_CURL_BODY: response,
        MOCK_CURL_STATUS: status,
        PATH: `${workspace.bin}:${process.env.PATH}`,
        RELEASE_VERSION: VERSION,
        RUNNER_TEMP: workspace.runnerTemp,
      },
    },
  );

  return { candidate, distributions, githubOutput, result, workspace };
}

function pypiFile(filename, digest, overrides = {}) {
  return {
    filename,
    digests: { sha256: digest },
    yanked: false,
    ...overrides,
  };
}

test("PyPI staging handles absent, partial, and complete approved versions", (t) => {
  const absent = runPypiStage(t, { message: "Not Found" }, "404");
  assert.equal(absent.result.status, 0, absent.result.stderr);
  assert.equal(readFileSync(absent.githubOutput, "utf8"), "upload_count=2\n");

  const partialDigest = sha256(join(absent.candidate, absent.distributions[0]));
  const partial = runPypiStage(t, {
    urls: [pypiFile(absent.distributions[0], partialDigest)],
  });
  assert.equal(partial.result.status, 0, partial.result.stderr);
  assert.equal(readFileSync(partial.githubOutput, "utf8"), "upload_count=1\n");

  const complete = runPypiStage(t, {
    urls: partial.distributions.map((filename) =>
      pypiFile(filename, sha256(join(partial.candidate, filename))),
    ),
  });
  assert.equal(complete.result.status, 0, complete.result.stderr);
  assert.equal(readFileSync(complete.githubOutput, "utf8"), "upload_count=0\n");
});

test("PyPI staging rejects unexpected, yanked, duplicate, malformed, and conflicting files", (t) => {
  const seed = runPypiStage(t, { message: "Not Found" }, "404");
  const [wheel] = seed.distributions;
  const digest = sha256(join(seed.candidate, wheel));
  const cases = [
    {
      name: "unexpected",
      metadata: { urls: [pypiFile("other.whl", digest)] },
      message: /unexpected PyPI distribution/,
    },
    {
      name: "yanked",
      metadata: { urls: [pypiFile(wheel, digest, { yanked: true })] },
      message: /is yanked/,
    },
    {
      name: "duplicate",
      metadata: { urls: [pypiFile(wheel, digest), pypiFile(wheel, digest)] },
      message: /duplicate metadata/,
    },
    {
      name: "malformed",
      metadata: { urls: [{ filename: wheel }] },
      message: /malformed release metadata/,
    },
    {
      name: "conflicting",
      metadata: { urls: [pypiFile(wheel, "0".repeat(64))] },
      message: /does not match the approved release/,
    },
  ];

  for (const fixture of cases) {
    const outcome = runPypiStage(t, fixture.metadata);
    assert.notEqual(outcome.result.status, 0, fixture.name);
    assert.match(outcome.result.stderr, fixture.message, fixture.name);
  }
});
