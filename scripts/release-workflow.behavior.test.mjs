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
const VERSION = JSON.parse(readFileSync(resolve(REPOSITORY_ROOT, "package.json"), "utf8")).version;
const TAG = `v${VERSION}`;
const TAG_OBJECT = "a".repeat(40);
const RELEASE_COMMIT = "b".repeat(40);
const SOURCE_CI_RUN_ID = 102;
const MOODLE_ASSET = `mod_scaffold-${VERSION}.zip`;
const WHEEL_ASSET = `scaffold_xblock-${VERSION}-py3-none-any.whl`;
const SDIST_ASSET = `scaffold_xblock-${VERSION}.tar.gz`;
const EVIDENCE_ASSET = "release-evidence.json";
const PROVENANCE_ASSET = `scaffold-${VERSION}-provenance.jsonl`;
const PACKAGE_ASSET_NAMES = [MOODLE_ASSET, WHEEL_ASSET, SDIST_ASSET];
const ASSET_NAMES = [...PACKAGE_ASSET_NAMES, "SHA256SUMS", EVIDENCE_ASSET, PROVENANCE_ASSET];

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
  elif [[ "$arguments" == *"/releases?per_page=100"* ]]; then
    printf '[['
    cat "$MOCK_RELEASE_JSON"
    printf ']]\\n'
  elif [[ "$arguments" == *"/actions/workflows/publish-pypi.yml/dispatches"* ]]; then
    exit 0
  elif [[ "$arguments" == *"/actions/runs/"* ]]; then
    printf '{"id":%s,"head_sha":"%s","event":"push","status":"completed","conclusion":"success","path":".github/workflows/ci.yml"}\\n' \
      "$MOCK_SOURCE_CI_RUN_ID" "$MOCK_SOURCE_CI_HEAD_SHA"
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

function installMockGit(bin) {
  writeExecutable(
    join(bin, "git"),
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "-C" && "$3" == "rev-parse" && "$4" == "HEAD" ]]; then
  printf '%s\\n' "$MOCK_RELEASE_COMMIT"
  exit 0
fi
echo "unexpected git invocation: $*" >&2
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
  const archive = join(download, MOODLE_ASSET);
  writeFileSync(archive, "exact CI-tested Moodle bytes\n");
  writeFileSync(`${archive}.sha256`, `${sha256(archive)}  ${MOODLE_ASSET}\n`);

  const result = runShell(
    workflowStep(RELEASE_WORKFLOW, "package", "Stage tested Moodle candidate"),
    {
      cwd: workspace.root,
      env: {
        CI_RUN_ID: String(SOURCE_CI_RUN_ID),
        GITHUB_REPOSITORY: "brainjamworks/scaffold",
        GITHUB_SERVER_URL: "https://github.com",
        RELEASE_COMMIT,
        RELEASE_VERSION: VERSION,
        TESTED_MOODLE_CANDIDATE: join(workspace.root, "download"),
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const staged = join(workspace.root, "dist", "release", VERSION, MOODLE_ASSET);
  assert.equal(readFileSync(staged, "utf8"), readFileSync(archive, "utf8"));
  assert.equal(sha256(staged), sha256(archive));
  assert.deepEqual(
    JSON.parse(
      readFileSync(join(workspace.root, "dist", "release", VERSION, EVIDENCE_ASSET), "utf8"),
    ),
    {
      schema: 1,
      source_commit: RELEASE_COMMIT,
      required_ci: {
        workflow: ".github/workflows/ci.yml",
        run_id: SOURCE_CI_RUN_ID,
        run_url: `https://github.com/brainjamworks/scaffold/actions/runs/${SOURCE_CI_RUN_ID}`,
      },
      moodle_candidate: {
        filename: MOODLE_ASSET,
        sha256: sha256(archive),
      },
    },
  );
});

function createCandidate(root) {
  const candidate = join(root, "candidate");
  const provenance = join(root, "provenance");
  mkdirSync(candidate);
  mkdirSync(provenance);
  for (const name of PACKAGE_ASSET_NAMES) {
    writeFileSync(join(candidate, name), `approved bytes for ${name}\n`);
  }
  writeFileSync(
    join(candidate, "SHA256SUMS"),
    `${PACKAGE_ASSET_NAMES.map((name) => `${sha256(join(candidate, name))}  ${name}`).join(
      "\n",
    )}\n`,
  );
  writeFileSync(
    join(candidate, EVIDENCE_ASSET),
    `${JSON.stringify(
      {
        schema: 1,
        source_commit: RELEASE_COMMIT,
        required_ci: {
          workflow: ".github/workflows/ci.yml",
          run_id: SOURCE_CI_RUN_ID,
          run_url: `https://github.com/brainjamworks/scaffold/actions/runs/${SOURCE_CI_RUN_ID}`,
        },
        moodle_candidate: {
          filename: MOODLE_ASSET,
          sha256: sha256(join(candidate, MOODLE_ASSET)),
        },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(join(provenance, PROVENANCE_ASSET), '{"bundle":"fixture"}\n');
  writeFileSync(join(candidate, "release-notes.md"), "candidate notes\n");
  return { candidate, provenance };
}

function writeChecksumManifest(candidate, names) {
  writeFileSync(
    join(candidate, "SHA256SUMS"),
    `${names.map((name) => `${sha256(join(candidate, name))}  ${name}`).join("\n")}\n`,
  );
}

function mockEnvironment(workspace, extra = {}) {
  return {
    GH_REPO: "brainjamworks/scaffold",
    GITHUB_API_URL: "https://api.github.test",
    GITHUB_SERVER_URL: "https://github.com",
    GITHUB_WORKSPACE: REPOSITORY_ROOT,
    MOCK_ASSET_DIR: join(workspace.root, "candidate"),
    MOCK_GH_LOG: join(workspace.root, "gh.log"),
    MOCK_RELEASE_COMMIT: RELEASE_COMMIT,
    MOCK_RELEASE_JSON: join(workspace.root, "release.json"),
    MOCK_SOURCE_CI_HEAD_SHA: RELEASE_COMMIT,
    MOCK_SOURCE_CI_RUN_ID: String(SOURCE_CI_RUN_ID),
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
  assert.ok(readFileSync(join(workspace.root, "gh.log"), "utf8").includes(`release create ${TAG}`));
});

test("draft retry preserves manually reviewed release notes", (t) => {
  const workspace = makeWorkspace(t, "scaffold-release-retry-");
  installMockCurl(workspace.bin);
  installMockGh(workspace.bin);
  const { candidate } = createCandidate(workspace.root);
  const existingAsset = MOODLE_ASSET;
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
  assert.ok(log.includes(`release edit ${TAG} --draft --prerelease`));
  assert.doesNotMatch(log, /--notes-file/);
});

function createApprovalFixture(t, { pending = false } = {}) {
  const workspace = makeWorkspace(t, "scaffold-release-approval-");
  installMockGh(workspace.bin);
  installMockGit(workspace.bin);
  const { candidate, provenance } = createCandidate(workspace.root);
  cpSync(join(provenance, PROVENANCE_ASSET), join(candidate, PROVENANCE_ASSET));
  const notes = join(workspace.root, "generated-release-notes.md");
  const output = join(workspace.root, "generated-release-output");
  const prepared = spawnSync(
    process.execPath,
    [
      resolve(REPOSITORY_ROOT, "scripts/prepare-release-candidate.mjs"),
      "--repository-root",
      REPOSITORY_ROOT,
      "--tag",
      TAG,
      "--commit",
      RELEASE_COMMIT,
      "--notes-output",
      notes,
      "--github-output",
      output,
    ],
    { encoding: "utf8" },
  );
  assert.equal(prepared.status, 0, prepared.stderr);
  let body = readFileSync(notes, "utf8");
  if (!pending) {
    body = body
      .replace(
        "- Moodle smoke test: pending",
        "- Moodle smoke test: passed on Moodle 4.5.7 (clean install)",
      )
      .replace(
        "- Open edX smoke test: pending",
        "- Open edX smoke test: passed on Sumac.3 (clean install)",
      );
  }
  const release = {
    id: 123,
    tag_name: TAG,
    name: `Scaffold ${VERSION}`,
    draft: true,
    prerelease: true,
    published_at: null,
    body,
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

test("approval refuses materially truncated release evidence", (t) => {
  const workspace = createApprovalFixture(t);
  const releasePath = join(workspace.root, "release.json");
  const release = JSON.parse(readFileSync(releasePath, "utf8"));
  release.body = [
    `- Source commit: \`${RELEASE_COMMIT}\``,
    "- Moodle smoke test: passed on Moodle 4.5.7 (clean install)",
    "- Open edX smoke test: passed on Sumac.3 (clean install)",
  ].join("\n");
  writeFileSync(releasePath, `${JSON.stringify(release)}\n`);

  const result = runShell(
    workflowStep(APPROVAL_WORKFLOW, "approve", "Validate evidence and publish the draft"),
    {
      cwd: workspace.root,
      env: mockEnvironment(workspace, { GH_TOKEN: "test-token" }),
    },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must preserve the complete generated evidence template/);
  assert.doesNotMatch(readFileSync(join(workspace.root, "gh.log"), "utf8"), /--method PATCH/);
});

test("approval requires checksums for exactly the approved packages", (t) => {
  const cases = [
    {
      label: "duplicate and missing package names",
      names: [MOODLE_ASSET, MOODLE_ASSET, MOODLE_ASSET],
    },
    {
      label: "an unexpected package name",
      names: [MOODLE_ASSET, WHEEL_ASSET, "unapproved-package.zip"],
    },
  ];

  for (const fixture of cases) {
    const workspace = createApprovalFixture(t);
    const candidate = join(workspace.root, "candidate");
    if (fixture.names.includes("unapproved-package.zip")) {
      writeFileSync(join(candidate, "unapproved-package.zip"), "unapproved bytes\n");
    }
    writeChecksumManifest(candidate, fixture.names);

    const result = runShell(
      workflowStep(APPROVAL_WORKFLOW, "approve", "Validate evidence and publish the draft"),
      {
        cwd: workspace.root,
        env: mockEnvironment(workspace, { GH_TOKEN: "test-token" }),
      },
    );

    assert.notEqual(result.status, 0, fixture.label);
    assert.match(
      result.stderr,
      /SHA256SUMS must name exactly the approved packages/,
      fixture.label,
    );
    assert.doesNotMatch(
      readFileSync(join(workspace.root, "gh.log"), "utf8"),
      /--method PATCH/,
      fixture.label,
    );
  }
});

test("approval refuses tested-Moodle evidence that does not match the release package", (t) => {
  const workspace = createApprovalFixture(t);
  const evidencePath = join(workspace.root, "candidate", EVIDENCE_ASSET);
  const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  evidence.moodle_candidate.sha256 = "0".repeat(64);
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);

  const result = runShell(
    workflowStep(APPROVAL_WORKFLOW, "approve", "Validate evidence and publish the draft"),
    {
      cwd: workspace.root,
      env: mockEnvironment(workspace, { GH_TOKEN: "test-token" }),
    },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /does not match the approved Moodle package/);
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
  assert.equal(log.split(`git/ref/tags/${TAG}`).length - 1, 2);
  assert.doesNotMatch(log, /immutable-releases/);
  assert.match(log, /--method PATCH repos\/brainjamworks\/scaffold\/releases\/123/);
  assert.match(
    log,
    /--method POST repos\/brainjamworks\/scaffold\/actions\/workflows\/publish-pypi\.yml\/dispatches/,
  );
  assert.ok(log.indexOf("--method PATCH") < log.indexOf("publish-pypi.yml/dispatches"));
});

function runPypiStage(t, releaseMetadata, status = "200") {
  const workspace = makeWorkspace(t, "scaffold-pypi-stage-");
  installMockCurl(workspace.bin);
  const candidate = join(workspace.runnerTemp, "candidate");
  mkdirSync(candidate);
  const distributions = [WHEEL_ASSET, SDIST_ASSET];
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
