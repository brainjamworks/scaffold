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
  the neutral, authoring, and learner-runtime composition roots;
  `composition/application` is the deliberate integration root above both
  lanes.
- Block feature modules export pure definitions. Core keeps neutral built-in
  definitions plus physically separate authoring and learner-runtime binding
  inventories. These are dependency boundaries, not separate capability
  universes: only `composition/application` joins them by persisted `nodeType`
  into complete Block capabilities.
- The application root resolves mandatory Core Block capabilities before
  cumulative host additions, validates both complete Tiptap bundles, and gives
  authoring and learner runtime only their own extension projection plus the
  same immutable neutral Block registry. Neither lane imports or traverses the
  opposite binding inventory.
- Mounted configuration is explicit and differentiated. The top-level
  `ScaffoldAuthoringEntry` requires one complete `ScaffoldApplication` because
  it coordinates authoring, publication, and lazy learner preview.
  `CourseDocumentEditor` requires one `ScaffoldAuthoringComposition`, while
  `ScaffoldLearnerApp` and `ContentRuntimeHost` require one
  `ScaffoldRuntimeComposition`. Internal Tiptap composers and renderers receive
  that exact lane composition; omission never selects a hidden Core default.
- Products that need both lanes construct a complete Core application with
  `createScaffoldApplication` from `@scaffold/core/extensions`. Lane-only hosts
  use `createCoreScaffoldAuthoringComposition` from
  `@scaffold/core/authoring` or `createCoreScaffoldRuntimeComposition` from
  `@scaffold/core/runtime`. These are the explicit Core-only constructors, not
  compatibility fallbacks.
- Mounted application or composition object identity participates in editor
  session lifetime. Replacing it establishes a new session; ordinary content
  updates using the same configuration identity retain the existing session.
- Layout feature modules export pure definitions. An immutable definition
  registry is keyed by persisted layout variant, with separate authoring and
  runtime view registries.
- A complete Surface capability keeps one `SurfaceVariantDefinition`, one
  `SurfaceAuthoringViewBinding`, and one `SurfaceRuntimeViewBinding` together:

  ```ts
  interface SurfaceCapability {
    readonly definition: SurfaceVariantDefinition;
    readonly authoringView: SurfaceAuthoringViewBinding;
    readonly runtimeView: SurfaceRuntimeViewBinding;
  }
  ```

  Core capabilities are resolved before cumulative host additions. Application
  composition validates matching `variantId` values, builds one immutable
  neutral Surface registry, and projects only `views`/`chrome` to authoring and
  only `views` to learner runtime.

- Surface definition declaration, module import, normalization, and passive
  registry construction do not execute `createSurface`. Factory output is
  sampled during explicit application or lane composition. Slide-composition
  definitions additionally wrap deliberate creation so their closed settings,
  default, and structure invariants are checked for every produced Surface.
- Every variant uses the one Core-owned persisted `surface` node. Capabilities
  contribute metadata and environment views, never another Surface node or an
  internal node factory.
- Physical authoring and learner-runtime Surface binding inventories remain
  separate. Only `composition/application` joins both lanes; authoring and
  runtime composition can reach only their own lane, and neutral Surface code
  cannot relay either binding contract. `@scaffold/core/extensions` re-exports
  the minimum construction and projection types without exposing built-in
  registries, inventories, view maps, creation catalogues, or node factories.
- Authoring composition derives two immutable creation catalogues from the
  resolved application. The in-document catalogue has exactly three sources:
  installed Block definitions, installed Layout definitions, and fixed Core
  structural actions (currently Grid). The separate Surface-creation catalogue
  is derived only from installed Surface definitions; Surface templates never
  enter the in-document catalogue.
- The authoring composer installs the exact catalogue pair in its Tiptap editor.
  Editor-aware consumers resolve that session identity through
  `getScaffoldAuthoringCataloguesForEditor`; composition-owned consumers receive
  it directly. Learner runtime receives no authoring catalogue, and no consumer
  reconstructs or falls back to a module-global Core inventory.
- Neutral checked creation with only a schema requires an explicit
  `InsertCatalog` from its caller. The operation does not discover or default a
  capability universe.
- `@scaffold/core/extensions` exposes only
  `getScaffoldAuthoringCataloguesForEditor` and the
  `ScaffoldAuthoringCatalogues` and `BlockInsertVariantDefinition` types for
  catalogue consumption. Catalogue builders, storage constructors, Core
  structural actions, built-in definitions, and built-in inventories remain
  private.
- Importing a Block, Layout, or Surface definition never mutates a global
  registry or insertion catalogue.
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
import { ... } from "@scaffold/core/extensions";
import "@scaffold/core/styles.css";

import { ... } from "@scaffold/contracts";
import { ... } from "@scaffold/grading";
```

The public package surface is pre-1.0 and should be treated as evolving until
the first stable release.

## Course Themes And Colour Modes

Scaffold separates persisted course presentation from surrounding application chrome:

- A course theme belongs to the authored document. It stores the selected preset identity,
  publication-level author colours, per-slot dark derivation/customisation provenance, typography,
  design controls, recipe provenance, and complete resolved light/dark snapshots.
- Authoring application colour mode belongs to local author preference. It changes the full-screen
  Scaffold authoring chrome and editing canvas, is not initialized from an LMS, and is not persisted
  in the course document.
- Learner Preview follows the current authoring application colour mode. This exercises the same
  contextual light/dark response that learner runtime receives from its host without changing the
  persisted course theme.
- Learner colour mode is supplied by the host when available and otherwise follows the browser
  preference. It selects the saved light or dark course appearance without rematerialising it.

Contracts owns the portable persisted shape. Core owns built-in presets, recipe validation,
materialisation, catalogue fallback, semantic token projection, and the scoped DOM/chart/overlay
application seams. Authors edit eleven publication roles; Core materialises those anchors into
semantic output. Information, success, warning, and error families remain preset-owned rather than
being inferred from brand colours.

Hosts may add structured preset and font definitions through `themeExtension` on the public
authoring and runtime entries. Extensions are data, not arbitrary CSS or executable generators.
An unavailable or invalid host preset falls back silently to Scaffold Default in learner runtime;
the saved snapshot is not mutated and becomes active again if the extension returns. Core contains
no private host branding and has no LMS-specific dependency.

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
