# Architecture

Scaffold is a platform-agnostic course content authoring toolkit. It stores a
Scaffold document once and renders that document through different host
platforms.

## Packages

- `packages/contracts` owns serializable, provider-neutral persisted document
  schemas and the portable contracts shared across package boundaries.
- `packages/grading` owns deterministic, framework-free answer-key validation.
- `packages/core` owns the React/Tiptap authoring and learner-runtime library.
  It exposes host port interfaces but does not implement persistence,
  media, grading, or platform protocols.
- `apps/playground` provides a browser-only local sandbox.

## Adapters

Adapters translate a host platform into Scaffold's public package interfaces.
They own host lifecycle, persistence, media, assessment delivery, learner
activity, permissions, and platform-specific protocols.

```txt
@scaffold/contracts <- @scaffold/grading <- apps/playground
@scaffold/contracts <- @scaffold/core    <- apps/playground
                                           <- adapters/*
```

Core never imports Grading, apps, or adapters. Playground is the sole current
Grading consumer because it owns the browser-local development port.
Adapters consume supported Core and Contracts entrypoints; future adapter use
of Grading requires a deliberate architecture change and is not pre-authorized.

The enforced JavaScript/TypeScript dependency graph starts with zero accepted
debt and no known-violations file. Future deliberate debt must use
dependency-cruiser's native known-violations mechanism and receive explicit
architecture review.

## Core Ownership And Construction

Core uses explicit, closed-world construction for its built-in editor features:

- `composition/model`, `composition/authoring`, and `composition/runtime` are
  the neutral, authoring, and learner-runtime composition roots.
- Block feature modules export pure definitions. One explicit built-in
  definition collection constructs an immutable registry keyed by Tiptap node
  type, while authoring and runtime keep separate extension lists.
- Layout feature modules export pure definitions. An immutable definition
  registry is keyed by persisted layout variant, with separate authoring and
  runtime view registries.
- Surface model definitions construct an immutable variant registry. Authoring
  and runtime bind their own view maps outside the neutral model.
- Authoring insertion is derived from block/layout definitions plus explicit
  non-block actions. Importing a definition never mutates a global registry or
  insertion catalog.
- `entrypoints/*` owns the public package seams, `host/ports` owns neutral host
  operations, and `ui/components` owns reusable Radix wrappers.

Provider-neutral persisted schemas belong in Contracts. Any schema,
configuration, or Tiptap adaptation module that remains in Core is classified
by its exact editor-local role; those folder names receive no blanket shared
ownership or dependency-rule exemption.

## Scaffold Documents

The authored Scaffold document is the source artifact. Authoring state and
learner response state are separate:

- Authored content, structure, settings, and answer keys belong to the document
  and are persisted by the host.
- Learner responses, attempts, feedback, and progress belong to runtime state
  and are handled through host-provided ports.
- Learner projections must not expose private answer-key data.

The current authored document format is pre-1.0 and may change. Hosts should
load persisted authored JSON through the public format boundary before handing
it to the editor.

## Public Boundaries

Supported imports are intentionally role-based:

```ts
import { ... } from "@scaffold/core/runtime";
import { ... } from "@scaffold/core/authoring";
import { ... } from "@scaffold/core/format";
import { ... } from "@scaffold/core/ports";
import { ... } from "@scaffold/core/media-policy";
import "@scaffold/core/styles.css";

import { ... } from "@scaffold/contracts";
import { ... } from "@scaffold/grading";
```

The public package surface is pre-1.0 and should be treated as evolving until
the first stable release.

### Host-owned React contexts

`ScaffoldServicesProvider` is the neutral, host-owned React context for
adapter-supplied media, assessment, and learner-activity services. It is
exported from `@scaffold/core/runtime`, but it is shared by authoring and
learner-runtime consumers rather than owned by the learner runtime.

Persistence is not part of `ScaffoldServicesProvider` or
`ScaffoldRuntimePorts`. Authoring saves explicitly through
`services.artifactPersistence`; learner runtime does not receive an artifact
persistence service.

`ScaffoldArtifactIdentityProvider` is a separate internal, host-owned context
shared by authoring and learner runtime. It normalizes artifact identity,
preserves unsafe-missing-identity behavior, and isolates runtime state by
artifact. It is not part of the public package surface.

This is a pre-1.0 breaking correction. `ScaffoldRuntimeProvider` and the former
runtime artifact-identity exports were removed without aliases or compatibility
shims. Consumers should use `ScaffoldServicesProvider`; artifact identity
remains internal.

## Verification Ownership

Dependency-cruiser owns JavaScript/TypeScript source dependency and
reachability evidence only. It does not analyze PHP or Python adapter code.
Oxlint and TypeScript own static source evidence, Vitest owns executable
contracts and behavior, parsed metadata tests own manifests and public maps,
artifact checks own generated and vendored byte drift, and native adapter tests
own their platform-language boundaries.

The root verification surface is:

```sh
vp run verify:static
vp run verify:architecture
vp run verify:artifacts
vp run verify:tooling
vp run verify:unit
vp run verify:build
vp run verify:release
```

`verify:release` aggregates all six focused commands without parsing or
normalizing their native output.

## Scaffold Agent

The public repository contains only the neutral integration seam and unavailable
state for Scaffold Agent. Active Agent behavior belongs to the separate hosted
product and is not shipped through public adapters.
