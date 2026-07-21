# @scaffold/grading

Pure TypeScript answer-key validation. Single source of truth used by both
the Playground local host and the installed adapters' native graders. Native
graders validate against the canonical conformance corpus at
`fixtures/assessment-grading.json`; generated adapter copies are checked for
drift.

No React. No DOM. No Yjs. No Tiptap. No framework. Just functions.

License: AGPL-3.0-only (see root `LICENSE`).
