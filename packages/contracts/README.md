# @scaffold/contracts

Shared provider-neutral schemas for the persisted Scaffold document model.

This package exists so Scaffold packages and host services can validate the
same serializable document metadata without importing the editor runtime. It
must stay runtime-neutral: no React, Tiptap, Yjs, DOM APIs, port functions,
or adapter implementation details.

## Owns

- Course-document mode and persisted document attribute schemas.
- Surface size, background, region, and persisted surface attribute schemas.
- Serializable document metadata shared across package boundaries.

## Does Not Own

- Port function interfaces such as `AssessmentPort`, `MediaPort`, or
  `ArtifactPersistencePort`.
- React hooks, providers, or editor runtime wiring.
- Tiptap/Yjs document behavior.
- Adapter implementations or host RPC details.
- Dev/browser port implementations.

## Boundary

`@scaffold/contracts` owns the shared document shapes. `@scaffold/core` owns
editor behavior and port interfaces. `adapters/*` own concrete host
implementations. Active Scaffold Agent protocol contracts belong to the
separate private hosted product, not this package.
