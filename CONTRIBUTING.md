# Contributing

Scaffold is pre-alpha. Contributions are welcome, but the public API and
adapter contracts are still being stabilized before `1.0`.

The project is maintained by Rizvan Ali. For general contribution questions,
contact
[support@scaffold.ac](mailto:support@scaffold.ac).

## Setup

```sh
vp install
vp run dev:playground
```

The playground runs on `http://localhost:5848`.

## Architecture Boundaries

Scaffold is a Vite+ managed workspace with two explicit dependency branches:

```txt
@scaffold/contracts <- @scaffold/grading <- apps/playground
@scaffold/contracts <- @scaffold/core    <- apps/playground
                                           <- adapters/*
```

Keep these boundaries intact:

- `packages/contracts` owns serializable schema contracts only.
- `packages/grading` stays pure TypeScript with no React, DOM, Tiptap, Yjs, or
  adapter dependencies. Playground is its sole current consumer.
- `packages/core` owns the platform-agnostic authoring/runtime library and
  host port interfaces. Core imports Contracts, never Grading, apps, or
  adapters.
- `adapters/*` implement host-specific persistence, media, assessment, learner
  activity, and platform protocols through public package seams.

Core must not import from adapters. Adapters must not reach into private core
source paths.

## Public Imports

Use the documented package entrypoints:

```ts
import { ... } from '@scaffold/core/runtime';
import { ... } from '@scaffold/core/authoring';
import { ... } from '@scaffold/core/format';
import { ... } from '@scaffold/core/ports';
import { ... } from '@scaffold/core/media-policy';
import '@scaffold/core/styles.css';

import { ... } from '@scaffold/contracts';
import { ... } from '@scaffold/grading';
```

Do not import from `@scaffold/core/src/...`, `@scaffold/core/document`, or
`@scaffold/grading/src/...`. If a contribution needs a private helper, promote
it intentionally through a public entrypoint or keep the adapter thinner.

## Working In Packages

For `packages/core`, prefer the existing subsystem boundaries:

- `authoring/` for author-facing editor composition.
- `runtime/` for learner-safe rendering and interaction paths.
- `document/` for internal ProseMirror/Yjs mechanics.
- `format/` for saved artifact/content format helpers.
- `host/ports/` for neutral host operation interfaces.
- `host/contracts/` and `host/providers/` for host inputs and React providers.
- `schemas/` for framework-free Zod schemas.
- `editor/` for blocks, layouts, registry, rich text, shell, and interactions.

For `packages/contracts`, keep values serializable and provider-neutral.

For `packages/grading`, keep validation deterministic and framework-free.

## Working In Adapters

Adapters should be thin host integrations:

- Translate host bootstrap data into Scaffold inputs.
- Implement persistence, media, assessment, and learner-activity ports.
- Import Scaffold through public package entrypoints only.
- Keep host lifecycle details inside the adapter.

XBlock is the active reference adapter. Moodle is parked/in-flight and should
not force new public APIs without a dedicated adapter-conformance pass.

## Verification

Start with the smallest useful check for your change, then broaden when the
change touches shared behavior or package boundaries.

Common commands:

```sh
vp run verify:static        # formatting, Oxlint, and TypeScript
vp run verify:architecture  # JavaScript/TypeScript dependency graph
vp run verify:artifacts     # generated schema and vendored artifact drift
vp run verify:tooling       # resolver, metadata, and generator tests
vp run verify:unit          # package and adapter tests
vp run verify:build         # package and app builds
vp run verify:release       # all six focused commands
```

Focused examples:

```sh
vp run verify:types
vp run @scaffold/core#test
vp run @scaffold/adapter-xblock#build
```

Before an adapter release, run `vp run verify:release` and review the public
API, adapter, authored-content, and XBlock boundary requirements described in
the relevant package README and [ARCHITECTURE.md](./ARCHITECTURE.md).

Dependency-cruiser analyzes JavaScript/TypeScript source dependencies; it does
not replace PHP or Python adapter checks. Oxlint, TypeScript, Vitest, structured
metadata tests, artifact checks, and native adapter tests remain the evidence
owners for their respective concerns. The architecture graph currently has
zero accepted dependency debt and no known-violations file.

## Repo Hygiene

Do not commit generated adapter bundles, `dist/`, `build/`, local screenshots,
scratch folders, `.env*` files, `node_modules/`, or local agent/session docs.

Generated adapter public bundles are produced by:

```sh
vp run @scaffold/adapter-xblock#build
vp run @scaffold/adapter-moodle#build
```

## Pull Requests

Keep PRs focused. Include:

- What changed and why.
- Which package or adapter boundaries were touched.
- Verification commands run and their result.
- Any known baseline failure that is unrelated to the PR.
