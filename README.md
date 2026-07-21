# Scaffold

Scaffold is a pre-alpha course content authoring toolkit for building rich
learning activities once and running them in multiple host platforms.

The repo is organized as a small platform-agnostic core, pure shared contracts,
pure TypeScript grading, a browser playground, and thin LMS adapters. The
Scaffold document is the authored artifact; runtime hosts receive learner-safe
content and provide persistence, media, and assessment ports.

Scaffold Agent has a deliberate product boundary. Public core owns its
launcher, shared dock presentation, neutral authoring integration seam, and a
complete unavailable state. Active Agent behavior belongs to the separate
Scaffold hosted SaaS product and is not shipped through this repository or its
installed LMS adapters.

## Status

Scaffold is not production-ready yet. APIs, package exports, document format
details, and adapter contracts may change before `1.0`.

Current maturity:

- `@scaffold/core`: active pre-alpha editor/runtime library.
- `@scaffold/contracts`: active provider-neutral Scaffold document schemas.
- `@scaffold/grading`: active pure TypeScript assessment validation.
- XBlock adapter: active reference adapter for Open edX.
- Moodle adapter: parked/in-flight; its package-owned test still participates
  in recursive workspace verification and currently requires PHP.
- LTI 1.3 and Google Classroom integrations: future. A future hosted
  integration channel enters Scaffold hosted SaaS; it does not add private
  Agent code to an installed adapter.

## Quick Start

Requirements:

- Node.js matching the root `package.json` engines; CI uses Node.js 24.11+.
- Vite+ `vp` CLI.

```sh
vp install
vp run dev:playground
```

The playground runs at `http://localhost:5848` locally. Its intended public URL
is `https://playground.scaffold.ac`.

The playground is a single-document IndexedDB sandbox for trying the editor. It
is not hosted storage, sharing, authentication, or a production deployment path.

## Repository Map

```txt
packages/contracts   provider-neutral Scaffold document schemas
packages/core        React/Tiptap authoring and runtime library
packages/grading     pure TypeScript answer-key validation

apps/playground      browser-only Scaffold sandbox

adapters/xblock      Open edX reference adapter, active
adapters/moodle      Moodle activity module, parked/in-flight
```

Packages own platform-neutral behavior. Adapters consume packages and implement
host-specific services.

## Public Entrypoints

Supported package imports are intentionally small:

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

`@scaffold/core/agent-host` is a purpose-specific, exact-version seam for the
first-party private `@scaffold/agent` package. It is not a general plugin or
adapter API. Public apps and installed adapters omit an Agent integration and
therefore use core's built-in unavailable experience.

Do not import from `@scaffold/core/src/...`, `@scaffold/core/document`, or
package source paths. Document mechanics are internal; saved artifact/content
helpers belong to `@scaffold/core/format`.

## Verification

Useful checks:

```sh
vp run verify:static        # formatting, Oxlint, and TypeScript
vp run verify:architecture  # JavaScript/TypeScript dependency graph
vp run verify:artifacts     # generated schema and vendored artifact drift
vp run verify:tooling       # resolver, metadata, and generator tests
vp run verify:unit          # package and adapter tests
vp run verify:build         # package and app builds
vp run verify:release       # all six focused commands
```

Dependency-cruiser owns JavaScript/TypeScript source dependencies only.
Oxlint, TypeScript, Vitest, structured metadata tests, artifact checks, and
native adapter tests own their respective evidence. The architecture graph has
zero accepted dependency debt; future deliberate debt must use
dependency-cruiser's reviewed native known-violations mechanism.

## Documentation

- [Architecture](./ARCHITECTURE.md) - public package and adapter boundaries.
- [Support](./SUPPORT.md) - where to ask questions and report problems.
- [Contributing](./CONTRIBUTING.md) - development setup and contribution rules.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). The short version: keep core
platform-agnostic, keep adapters thin, avoid private package imports, and run
the smallest verification that proves your change before opening a PR.

## Security

Please report suspected vulnerabilities privately. See [SECURITY.md](./SECURITY.md).

For general support, contact [support@scaffold.ac](mailto:support@scaffold.ac)
or see [SUPPORT.md](./SUPPORT.md).

## License

Scaffold is licensed under `AGPL-3.0-only`. See [LICENSE](./LICENSE).
The separate hosted repository has its own existing package manifests and is
outside this repository's license statement.
