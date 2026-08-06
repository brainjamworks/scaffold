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

## Generated assessment schema

`assessment.schema.json` is a Draft-07 structural projection of the canonical
runtime contracts. The bundle declares its required extensions with
`x-scaffold-semantics: ["score-v1"]`, and the concrete canonical Score schema
carries `x-scaffold-semantic: "score-v1"`. The marker is the sole authority for
Score semantics; definition names and reference strings carry no semantic
meaning. Draft-07 can enforce the closed Score shapes and IEEE-754 safe-integer
bounds, but it cannot compare the sibling `raw`, `min`, and `max` values.

Code claiming full canonical Score validation must register the `score-v1`
semantic extension, audit the manifest and markers recursively, enforce
`min < max` and `min <= raw <= max` at every marked node, and fail closed for
missing, malformed, unknown, or undeclared semantics. A generic schema with no
manifest and no markers receives ordinary structural validation. A generic
Draft-07 result without the extension is structural validation only.

Validation begins after standards-compliant host JSON decoding and uses the
decoded numeric value. Original JSON number spelling is not retained or part
of the contract: a decoded safe integer is accepted whether its source token
was written as `1`, `1.0`, or another spelling that decodes to that value.
Decoded fractional, non-finite, boolean, and unsafe-integer values remain
invalid.
