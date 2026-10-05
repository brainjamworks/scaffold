# Scaffold Agent Instructions

## Start Here When Resuming Work

This tracked file is the entry point for a fresh agent. Do not depend on prior
chat sessions, local scratch files, personal skills, or a handover prompt from
the user. Detailed plans, review findings and execution state live in the
[Scaffold Linear project](https://linear.app/brainjam/project/scaffold-eb84fa36ff55).

Read in this order:

1. [Current pause checkpoint](https://linear.app/brainjam/document/scaffold-project-pause-checkpoint-5-october-2026-110a6e30175c)
   for completed fixes, unresolved findings, verification evidence and resume order.
2. [Planning index](https://linear.app/brainjam/document/scaffold-planning-index-and-pause-checkpoint-69de0a05559c)
   for the authoritative architecture/contracts, phase plans and archived records.
3. [Layers implementation/dependency index](https://linear.app/brainjam/document/presentation-layers-implementation-plan-and-dependency-index-b3d047952881),
   then the linked contracts, issue, phase plan and review evidence for the task
   being considered. Checkpoints are navigation, not substitutes for that evidence.

Check git status and recent commits against the checkpoint before acting. If
the Linear project has a newer checkpoint, use it; do not reset newer code to
the historical pause baseline. If Linear is unavailable, report that limitation
instead of guessing the current review disposition.

### Recorded Position And Next Task — 5 October 2026

- Active workstream: Presentation Layers, parent epic RIZ-396. The project is
  paused, with implementation through `9d093d6e` pushed to `main`; later handover
  documentation commits do not change that implementation baseline.
- Phase 1 (RIZ-413, tasks 1.1–1.8) and Phase 2 (RIZ-414, tasks 2.1–2.4) are
  implemented. Aggregate acceptance remains open. Phase 3 (RIZ-415) and Phase 4
  (RIZ-416) have not started. Do not redo the completed corrections in the checkpoint.
- **Next task when work resumes:** refresh the aggregate acceptance gates once
  on the checked-out baseline. Record exact commands, exit codes and failure
  lists against RIZ-414; compare them with the checkpoint's dated findings.
  Explicitly classify remaining failures as fixes, separately owned debt or
  Phase 3 dependencies. Make that acceptance decision visible before starting
  Phase 3 task 3.1; do not silently waive failures or start broad cleanup.
- The missing Section-to-Layer playback binding belongs to Phase 3 task 3.1.
  Do not hide that gap with a test-only binding or compatibility shim. Scaffold
  is in alpha: retain the clean Layer model, one Surface clock and no legacy path.
- The user accepted potentially failing CI for the backup push, not as feature
  acceptance or release approval. Earlier full-suite counts are historical;
  later focused passes are not a fresh aggregate result.

### Finding Preserved Material

The ignored `docs/` tree is not required to discover the work. Its complete
planning archive and source-path/Linear mapping manifest are attached to
[RIZ-567](https://linear.app/brainjam/issue/RIZ-567/preserve-scaffold-plans-in-linear-before-project-pause).
That issue also holds `scaffold-pause-review-evidence-2026-10-05.tar.gz` with the
latest bounded review and verification logs. Its older `AGENTS.md` is an archive
copy: **do not overwrite this tracked file with it**. Read only the historical
records needed for the current task; superseded Flow/Sequence plans are not
current architecture.

The old `codex/authoring-notifications` branch is backed up separately and is
not the active workstream. The obsolete spike worktree was discarded by the
user. Neither is a prerequisite to continuing Layers.

Keep this entry point, the Linear project overview and the current checkpoint
aligned when the active workstream, phase or next action changes. Keep detailed
execution/review history in Linear, not duplicated here.

## Results And Error Handling

- Separate expected, recoverable failures from programming defects. A caller
  should receive an expected failure as typed data; a broken invariant must
  remain observable as a thrown error, assertion failure or `Panic`.
- Use a typed result at a fallible boundary when its caller can make a
  meaningful decision about the failure. Do not replace actionable failures
  with booleans, `null`, generic strings or swallowed exceptions.
- Model expected errors as reason-specific discriminated variants with all
  applicable facts required. Avoid broad error records containing unrelated
  optional properties; make illegal error states unrepresentable.
- When `better-result` has been explicitly approved and installed in the
  owning package, use `Result<T, E>` for result construction and composition.
  Do not add the dependency, migrate existing contracts or spread its use
  beyond an approved slice merely because this instruction mentions it.
- Use `Result.err(...)` only for expected failures that callers may propagate,
  recover from, accumulate or present. Do not flatten unexpected exceptions or
  invariant violations into an expected error union.
- Preserve independent outcomes. When a batch must continue after one item
  fails, collect successful values and typed diagnostics rather than
  short-circuiting the entire batch; `Result.partition` is appropriate when it
  makes that policy clearer.
- Prefer plain, immutable, reason-specific records for diagnostics retained in
  editor/plugin state or transported across a boundary. Use `TaggedError` only
  when real `Error` behaviour, a cause/stack or exhaustive tagged-error
  matching provides concrete value.
- Do not persist or serialize library-specific `Result` or error class
  instances into the portable document. Translate them at the owning boundary
  into validated, plain data when transport or persistence is required.
- Do not use `unwrap()` for routine domain or UI decisions. It is reserved for
  places where an `Err` proves a broken invariant.
- Convert domain errors to friendly author- or learner-facing copy only in the
  presentation owner. Preserve the original typed error and cause for tests,
  diagnostics and observability.
- Test every expected error variant and its required facts. Also prove that
  programming defects remain observable and are not accidentally converted
  into ordinary failures.
