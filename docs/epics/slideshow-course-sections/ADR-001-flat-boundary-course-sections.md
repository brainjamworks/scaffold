# ADR: Flat Boundary Course Sections

## Status

Accepted

## Context

Scaffold needs named groups inside one Slideshow artefact for authoring, navigation and future
projection work. A full course must remain one artefact, while slides remain Surfaces and layout
containers remain separate. The model also needs stable identities without creating recursive
content ownership or requiring every consumer to interpret editor markers.

## Options Considered

- Nested Course Section containers with Surfaces as descendants.
- An independent outline or metadata graph beside the document.
- Flat boundary nodes in the ordered Slideshow sequence.

## Decision

Use one flat level of named boundary nodes. A boundary starts a Course Section and the section owns
the following contiguous run of Surfaces by order. Core exposes one validated Course Structure
projection; authoring and runtime consume it instead of independently scanning boundaries.

## Consequences

- One artefact can represent either a small activity or a complete course without inventing
  modules or chapters.
- Stable section identity is available to navigation, future progression/branching work and
  standards adapters without turning a section into an LMS activity.
- The model avoids recursive containment and keeps Surfaces as the content-bearing nodes.
- Consumers must use the shared projection; they must not reconstruct membership from raw document
  positions or visible content.
- Nested sections, section policy and delivery semantics remain future capabilities with separate
  ownership.
