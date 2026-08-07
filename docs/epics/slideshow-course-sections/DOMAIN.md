# Course Sections Domain

Read first: [./LANGUAGE.md](./LANGUAGE.md)

## Model

One Slideshow artefact may be either an ordinary unsectioned Surface sequence or a completely
partitioned, flat sequence of Course Sections. Each Course Section is represented by a stable
boundary identity and title; the Surfaces remain the content-bearing nodes in the Slideshow.

## Ownership And Boundaries

- Core owns the canonical interpretation of Course Section order and membership.
- Authoring commands mutate the boundary structure and preserve stable identities.
- Runtime navigation consumes the interpreted structure and retains ordinary linear previous/next
  behaviour across boundaries.
- Semantic navigation and future policy or delivery adapters consume the same interpreted
  structure; they do not rescan markers or infer membership independently.
- Course Sections do not own completion, scoring, progression, branching edges, LMS activities or
  delivery-standard semantics.

## Lifecycle

Authoring establishes, renames, moves, duplicates and removes boundaries while preserving valid
membership. Slide insertion, deletion, duplication and movement deterministically preserve the
partition. Invalid or unsupported persisted structure fails clearly instead of being silently
reinterpreted.

## Invariants

- A sectioned Slideshow assigns every Surface to exactly one flat Course Section.
- Each Course Section covers one contiguous, non-empty run of Surfaces.
- Course Section identity is independent of title, position and membership.
- Page artefacts never acquire Course Sections.
- Course Sections remain portable and free of SCORM, cmi5, xAPI, LTI, Moodle and Open edX fields.

## Accepted Patterns

- Use the Course Structure read projection as the sole membership/index seam.
- Use typed Tiptap commands for authoring mutations and the supplied transaction for the atomic
  edit.
- Keep the public semantic hierarchy derived; do not create a second editable outline.

## Anti-Patterns

- Inferring sections from visible title slides, headings or formatting.
- Persisting ProseMirror positions as durable identities.
- Adding legacy aliases, metadata fields or parallel interpretations of Course Sections.
- Treating a Course Section as a module, independently persisted artefact, completion boundary or
  SCORM SCO.

## Decision History

- [ADR-001: Flat boundary Course Sections](./ADR-001-flat-boundary-course-sections.md)
