# Changelog

All notable Scaffold changes should be recorded here. Entries are for users
and contributors, not a substitute for commit history.

The changelog follows the principles of
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Dates use ISO 8601
format. Breaking changes and persisted-document compatibility changes must be
called out explicitly.

## Unreleased

### Added

- API stability contract and release checklist for installable adapter releases.
- Public API boundary check for adapter imports.
- Scaffold authored document format v1, persisted as
  `courseDocument.attrs.schemaVersion`.
- Scaffold document migration load boundary for LMS-stored authored JSON.
- XBlock adapter protocol v1 marker in bootstrap data and frontend handler
  payloads.
- Assessment runtime problem ids now derive from artifact + authored block id;
  surface ids remain projection placement metadata and are not required for
  grading identity.
- Canonical assessment target contracts and response values for adapter
  transport and grading boundaries.
