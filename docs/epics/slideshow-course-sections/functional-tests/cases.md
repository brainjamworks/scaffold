# Functional Test Cases: Slideshow Course Sections

**Work item:** `docs/epics/slideshow-course-sections`
**Source artifacts:** `requirements.md`, `architecture.md`, `models/`, `plans/`, `reviews/final.md`
**Status:** executed

## Scope

### In Scope

- Canonical Course Structure projection and section membership.
- Authoring section lifecycle and integration with the editor.
- Runtime host and player selection behaviour for sectioned Slideshows.
- Format and migration compatibility for existing document shapes.

### Out Of Scope

- Browser-only visual inspection and assistive-technology traversal; no Chrome DevTools connector or
  stable browser entry point was available in this session.
- Semantic Document Tree integration, SCORM/cmi5 export and future progression or branching work;
  those are separate capabilities.

## Environment Assumptions

- **Runtime:** `@scaffold/core` authoring and runtime test environment.
- **URL or entry point:** not supplied; verification uses the package's focused integration suite.
- **Required data/accounts:** repository fixtures and test documents.
- **Browser tool:** unavailable in this session.

## Case Matrix

### Journey 1: Author and interpret sectioned Slideshows

#### FT-001: Establish and maintain Course Sections

**Trace:** requirements for complete partitioning, stable identity and slide editing; Phase 2-6 plan
acceptance criteria.
**Preconditions:** A valid Slideshow document and registered Surface variants.

**Steps:**
1. Run the Course Structure projection and authoring-node integration tests.
2. Exercise section creation, rename, duplicate, move, remove and slide-edit paths.

**Expected:** Every sectioned document is completely and contiguously partitioned; identities stay
stable through title and membership edits; invalid shapes fail clearly.
**Evidence To Collect:** Focused test command output and test assertions.

#### FT-002: Preserve format and runtime behaviour

**Trace:** document-format, migration, runtime-host and player-selection requirements.
**Preconditions:** Canonical v4 fixtures plus unsectioned and sectioned Slideshow fixtures.

**Steps:**
1. Run format and migration tests.
2. Run runtime host and player selection tests.

**Expected:** Existing unsectioned Slideshows remain valid; runtime preserves linear navigation
  while exposing the canonical section structure to its consumers.
**Evidence To Collect:** Focused test command output and test assertions.

## Coverage Notes

The focused integration suite is the available functional acceptance surface for this package. A
browser run should be added when a stable playground route and Chrome DevTools connector are
available.

## Blocked Coverage

- Browser-facing visual, keyboard and assistive-technology cases - Chrome DevTools MCP and a stable
  running application entry point were unavailable.
