# Architecture: Course Themes and Colour Modes

**Work kind:** epic architecture
**Status:** draft
**Epic root:** `docs/epics/course-themes-and-colour-modes`
**Sources:** [requirements.md](./requirements.md),
[author theme scenario](./scenarios/author-selects-and-customises-theme.md),
[author modes scenario](./scenarios/author-controls-application-and-preview-modes.md),
[learner mode scenario](./scenarios/learner-content-adapts-to-environment.md),
[host theme scenario](./scenarios/host-theme-is-available-or-missing.md),
[upgrade scenario](./scenarios/course-appearance-survives-upgrades.md)

## Read This First

The chosen solution treats a course theme as a complete, versioned snapshot inside the portable
course document while preserving a bounded author palette as editable intent. A separate Core
catalogue supplies selectable preset definitions, closed colour-family recipes, and font metadata,
while transient colour-mode state is resolved independently for the authoring application, author
course preview, and learner runtime.

The most important constraint is that one global dark-mode token switch is invalid. Scaffold
application chrome and authored course content occupy nested but independently themed scopes, and
explicit surface/block styling remains outside automatic theme adaptation.

## Guidance Loaded

- [`ARCHITECTURE.md`](../../../ARCHITECTURE.md) - Contracts owns provider-neutral persisted schemas;
  Core owns React/Tiptap authoring and learner runtime; adapters translate host state into public
  Core interfaces.
- [`brand/DESIGN-SYSTEM.md`](../../../brand/DESIGN-SYSTEM.md) - establishes the current brand,
  semantic palette, local-font policy, flat-at-rest component vocabulary, and token source of
  truth.
- `frontend-ui-engineering` (`addyosmani/agent-skills`) - keep transient UI state at the narrowest
  useful owner, use semantic colour tokens, and make theme controls keyboard-accessible and
  responsive.
- `api-and-interface-design` (`addyosmani/agent-skills`) - define and validate public contracts at
  boundaries, prefer additive optional public inputs, and avoid exposing internal CSS
  implementation as the host interface.
- `deprecation-and-migration` (`addyosmani/agent-skills`) - use an additive document-version
  migration and keep old and new persisted meanings explicit rather than changing a field's
  interpretation in place.
- `security-and-hardening` - treat persisted author values and host theme registrations as untrusted
  boundary data; render only allowlisted structured values and never accept arbitrary CSS or font
  URLs.
- [MDN `prefers-color-scheme`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-color-scheme) -
  browser preference is widely available and suitable as the learner fallback source.
- [MDN cascade introduction](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Cascade/Introduction) -
  unlayered normal declarations outrank named layers, confirming that Core's token declarations
  must join the declared layer system for `sc-adapters` to remain effective.
- Installed ECharts 6 declarations in `echarts/types/src/core/echarts.d.ts` - `init` and `setTheme`
  accept a theme object, so a chart can consume its resolved course scope instead of a
  module-global registered theme.
- [Fontsource Source Serif 4](https://fontsource.org/fonts/source-serif-4/install),
  [Source Serif licensing](https://github.com/adobe-fonts/source-serif), and
  [Inter licensing](https://github.com/rsms/inter) - variable local packages are available and the
  proposed new families use the SIL Open Font License.
- [`spikes/author-palette-model.md`](./spikes/author-palette-model.md) - compared curated
  publication palettes, Material Color Utilities, Adobe Leonardo, and a Scaffold-specific
  perceptual resolver against current token usage and awkward author inputs.
- [DTCG Resolver 2025.10](https://www.designtokens.org/tr/2025.10/resolver/) - validates
  context-specific light/dark token resolution while keeping token roles stable.

## Current Shape

Contracts currently defines document format v3 with `theme?: string | null` on the course-document
attributes. Core's Tiptap course-document node round-trips that value as `data-course-theme`, but no
selector, registry, editor, or resolver consumes it.

Authoring loads stored JSON through Core's format boundary, migrates it to the current document
version, seeds a Yjs-backed Tiptap document, and projects the complete course-document node into
learner content on save. This means course theme state placed on the root course-document attributes
already follows the required authoring, persistence, preview, and learner path.

The public authoring and runtime entrypoints expose application components and provider-neutral host
contracts. Moodle mounts Core's lower-level runtime host, while XBlock mounts the learner
application. Any new learner presentation input must therefore be consistent across both supported
runtime entry surfaces.

Core's global stylesheet declares semantic `--color-*` values unlayered on `:root, :host` and fixes
the body to a light colour scheme. The same token names are consumed by application chrome,
authoring surfaces, learner surfaces, blocks, and overlays. The CSS-layering branch has established
the order `sc-reset`, `sc-base`, `sc-components`, `sc-overlays`, `sc-adapters`, but the unlayered
token declarations currently outrank every named layer.

Course DOM lives inside clear authoring and runtime wrappers. Content-owned overlays portal into
owned overlay hosts appended to editor/player containers, so token inheritance must cover both the
course content tree and its owned portal hosts. Application-owned panels and dialogs must continue
to inherit application tokens.

ECharts currently registers one global theme at module evaluation by reading
`document.documentElement`. It cannot distinguish two course scopes, host theme availability, or a
later colour-mode change.

## Chosen Solution

### Versioned course snapshots

Document format v4 replaces the ambiguous string meaning with the
[persisted course theme model](./models/persisted-course-theme.md). The model records preset
provenance and a complete resolved value snapshot. Rendering never consults the current built-in
preset defaults for an already-materialised course, so a package upgrade cannot silently restyle
published content.

The preset ID remains load-bearing for availability. A snapshot whose host preset is not registered
uses Scaffold Default for rendering without mutating the snapshot. When the preset becomes
available again, the saved values resume. This preserves the confirmed host fallback behaviour
without making private definitions portable OSS dependencies.

### Author palette, preset recipes, and semantic snapshots

The [theme palette resolution model](./models/theme-palette-resolution.md) separates three colour
contracts:

- a bounded publication palette whose foundation, creative, and link roles authors understand;
- a preset-owned closed recipe containing foundation behaviour, status families, semantic
  mappings, and a data-palette strategy;
- the complete light and dark semantic snapshots consumed by Scaffold components.

A preset is a complete curated design system, not the result of one universal source colour.
Scaffold Default, Editorial, Minimal, and host presets may therefore retain distinct neutral,
status, and data character after an author changes a creative colour.

The first-release author palette contains eleven independently editable roles:

- four foundation roles: course background, content surface, body text, and heading text;
- six creative roles: primary, secondary, and four accents;
- one explicit link colour.

The link colour is independent from primary so an author can maintain inline-link legibility and
emphasis without changing solid actions. All four accents remain because calibration across
Default, Editorial, and Minimal found each independently useful for publication variety and data
series. On-colours, interaction states, muted values, borders, focus, overlays, status variants,
and final chart-series outputs are resolved semantics rather than ordinary author controls.

An explicit author colour remains an exact anchor within its colour family. A pure versioned Core
materialiser may derive related tones and select them for semantic uses, but it cannot silently
substitute an unrelated visible anchor. Status families remain preset-owned and independent of
primary, secondary, and accent edits. Foundation changes may alter which tone of a status family is
selected against a surface without changing the family's semantic hue ownership.

Core owns the resolver vocabulary and recipe schema. A maintained perceptual-colour utility such as
Culori may implement parsing, interpolation, gamut mapping, colour difference, and contrast behind
that seam; no library-specific model enters Contracts or host extensions.

### Catalogue, not a global mutable registry

Core constructs an immutable [theme catalogue](./models/theme-catalogue.md) from its built-ins plus
an optional host extension supplied at an application entry boundary. Importing a theme definition
has no side effect. This follows Core's existing closed-world construction approach for blocks,
layouts, and surfaces while still giving hosts one explicit extension seam.

The catalogue owns author-facing preset and font metadata, preset author defaults, closed recipes,
and complete materialised snapshots. It does not own course state. Selecting or resetting a preset
copies those current values into the document; changing the catalogue later does not change that
saved snapshot.

The built-in catalogue contains:

- **Scaffold Default:** Poppins headings and body, JetBrains Mono for code.
- **Editorial:** Source Serif 4 headings, Poppins body, JetBrains Mono for code.
- **Minimal:** Inter headings and body, JetBrains Mono for code.

Poppins and JetBrains Mono remain the application identity. Source Serif 4 and Inter are added as
course-theme fonts rather than replacing the authoring application's typography.

Heading, body, and code are semantic typography roles, not font-category restrictions. The Theme
panel offers the complete curated catalogue for each role, so an author may use any available
sans-serif, serif, or monospaced family in any role. Presets supply sensible defaults without
constraining later customisation.

### Contextual colour-mode lifecycles

The [colour-mode model](./models/colour-mode-state.md) defines:

- authoring application mode, owned by the authoring shell, remembered locally, and supplied to
  its chrome, course canvas, Theme sheet, and embedded learner Preview;
- learner mode, resolved from explicit host input and otherwise from live browser preference.

Each rendering container supplies an already resolved `"light"` or `"dark"` mode to course
content. The course document neither owns nor persists a forced presentation mode.

### Nested semantic token scopes

Core projects the resolved application palette on each application root and projects the resolved
course palette on a dedicated course theme scope around the Tiptap content. The
[theme token contract](./models/theme-token-contract.md) owns the stable course semantics and the
mapping into existing component consumption aliases.

Application and base token declarations participate in `sc-base`. Component rules remain in
`sc-components` or `sc-overlays`; host CSS remains in `sc-adapters`. The course scope rebinds the
legacy `--color-*`, typography, radius, stroke, shadow, and density aliases to resolved
`--sc-course-*` values. Explicit surface/block styles continue to target the relevant property
directly and therefore remain fixed.

The course scope carries observable theme ID, availability, and resolved mode attributes.
`data-course-theme` remains on the persisted course-document node for compatibility and inspection;
transient mode is never written into Tiptap attributes. Content-owned portal hosts receive the same
resolved course variables. Application-owned portals remain in the application scope.

### Authoring materialiser and one runtime resolver

A pure versioned authoring materialiser consumes preset recipe plus author palette inputs and
produces complete light and dark semantic snapshots. It runs only for deliberate authoring
commands: preset selection/reset, author-palette edit, or dark derivation reset.

Dark provenance belongs to each author slot or family. A light edit updates the corresponding dark
slot only while that slot remains derived. Editing one dark slot does not detach the rest of the
dark palette.

A pure Core resolver consumes the persisted theme, catalogue, and resolved course mode and returns:

- the effective preset ID and availability state;
- the effective complete theme values;
- a validated semantic token map;
- the resolved font definitions;
- renderer-neutral chart tokens.

Authoring canvas, learner preview, and learner runtime use this same result. The authoring UI may
display the unavailable status; learner runtime only consumes the fallback result.

Charts initialise from the resolved theme object associated with their nearest course scope and
update their theme when that resolution changes. They no longer register or depend on one global
document-root theme.

### Theme authoring through document commands

The course Theme panel is shell-owned UI backed by a theme-authoring command surface. Commands
materialise and replace the root course-document theme attribute through Tiptap/Yjs transactions,
so author-palette edits, preset switches, and resets participate in the existing collaboration,
history, autosave, and learner projection mechanisms. Continuous picker movement may preview local
materialised values, but one committed author action creates one document transaction and undo
step.

## What This Is Not

- **A CSS-only theme selector:** CSS cannot provide author-facing metadata, structured
  customisation, snapshot stability, validation, or host-theme availability.
- **One React theme context for everything:** application preference, course document state, and
  learner environment have different owners and lifecycles.
- **Sparse overrides over live preset defaults:** that would allow later preset edits to change
  existing courses.
- **A persisted learner colour-mode preference:** environment mode is transient and must not become
  authored content.
- **A URL-based font loader:** font URLs and uploads are outside the approved curated catalogue and
  introduce CSP, privacy, licensing, and availability failures.
- **An unrestricted CSS variable editor:** persisted theme data is a stable structured contract,
  not an escape hatch into Core internals.
- **A resolved semantic-token editor:** the complete semantic palette remains necessary for
  rendering, but exposing every field permits incoherent split states and couples authoring to
  implementation.
- **A one-source-colour generator:** dynamic source-colour schemes are useful for personalisation,
  but course publication presets require independently designed foundation, creative, status, and
  data families.

## Owners, Runtimes, Packages, Services, Apps

- **`@scaffold/contracts`** - owns document format v4 and the serialisable course theme schemas.
- **Core theme model** - owns built-in values, closed palette recipes, authoring materialisation,
  per-slot dark derivation, catalogue construction, runtime resolution, token projection, and
  validation adapters.
- **Core authoring shell** - owns the application mode preference and header control, supplies that
  mode to the course context and Theme panel, and owns unavailable-theme status and theme document
  commands.
- **Core authoring document** - owns persisted course theme state in the root Tiptap/Yjs document.
- **Core learner runtime** - owns learner mode fallback resolution and applies the saved course
  theme consistently to page and slideshow renderers.
- **Core UI/token layer** - owns application palettes, stable course semantic tokens, font
  catalogue integration, and the CSS cascade boundary.
- **Core chart renderer** - consumes renderer-neutral tokens from its nearest resolved course
  scope.
- **Moodle and XBlock adapters** - translate an LMS colour-mode signal when available and provide
  optional host theme extensions; they do not interpret or persist course themes.
- **Playground** - demonstrates built-in presets, host-mode input, and all application/course mode
  combinations without becoming a production preference owner.

## Models

- [`models/persisted-course-theme.md`](./models/persisted-course-theme.md) - exact course-owned
  snapshot, palette, typography, design, provenance, and migration shape.
- [`models/theme-catalogue.md`](./models/theme-catalogue.md) - built-in/host preset and font
  definitions, immutable catalogue construction, validation, and availability semantics.
- [`models/colour-mode-state.md`](./models/colour-mode-state.md) - authoring-container and
  learner-container mode contracts and browser fallback precedence.
- [`models/theme-token-contract.md`](./models/theme-token-contract.md) - stable semantic course
  tokens, CSS scope attributes, aliases, and non-DOM renderer projection.
- [`models/theme-palette-resolution.md`](./models/theme-palette-resolution.md) - author palette
  slots, closed preset recipe seam, per-slot dark provenance, and materialisation invariants.

## Seams And Responsibilities

- **Format boundary:** migrates and validates stored content before authoring; invalid theme payloads
  fail as invalid document content rather than becoming unchecked CSS.
- **Theme extension input:** optional, additive application configuration; invalid extension entries
  are excluded with structured catalogue issues while built-ins remain usable.
- **Theme authoring commands:** the only mutation seam for selecting, customising, switching, and
  resetting course themes.
- **Palette materialiser:** pure authoring-only seam from preset recipe and author palette to
  complete persisted snapshots; no React, DOM, LMS, storage, or renderer dependency.
- **Theme resolver:** pure and shared; no React, DOM, LMS, storage, or ECharts dependency.
- **Course theme scope:** the DOM boundary for resolved course variables and mode; it is distinct
  from the persisted course-document node.
- **Application theme scope:** the DOM boundary for authoring or learner-player chrome.
- **Learner host mode input:** accepts only a resolved light/dark value; host detection mechanics
  remain adapter-owned.
- **Local preference storage:** stores only the authoring application mode and tolerates
  unavailable/blocked storage.
- **CSS adapter layer:** allows supported host styling after Core without exposing Core's
  application internals as persisted document data. Direct course-token overrides are host-local
  presentation, not selectable presets or saved course customisations.

## Flow And Lifecycle

1. New course creation snapshots Scaffold Default from the current built-in catalogue into document
   format v4.
2. Stored documents cross the format boundary. Version 3 documents migrate before Core mounts
   authoring or learner rendering.
3. Core constructs one immutable catalogue for the mounted application from built-ins and the
   optional host extension.
4. The rendering container resolves its mode: the authoring application supplies its active mode,
   while the learner runtime uses host input or browser fallback.
5. Authoring commands materialise complete snapshots only when an author intentionally changes the
   theme; ordinary rendering does not regenerate colours.
6. The runtime theme resolver combines saved theme state, catalogue availability, and course mode
   into one effective token result.
7. Course content, content-owned overlays, and non-DOM renderers consume the same result.
8. In authoring, theme commands change the root document attribute. Tiptap/Yjs history and autosave
   carry that change into the author artifact and learner projection.
9. Preset switch or reset snapshots the selected preset's current values. Ordinary package upgrades
   do not re-resolve existing saved values from preset defaults.
10. If a host preset is missing, resolution uses Scaffold Default without changing the saved
    selection or snapshot. Availability restoration reactivates the saved values.

## Operational Concerns

- **Compatibility:** document format v4 is an additive migration from v3. Legacy null themes
  materialise the v4 Scaffold Default snapshot matching the existing light appearance. Legacy
  non-empty identifiers remain recoverable references and fall back until a matching preset is
  registered.
- **Security:** persisted colours, numeric values, enum choices, identifiers, and font references
  are schema validated. No theme value is interpreted as HTML, a URL, a stylesheet, or arbitrary
  CSS. Host font assets must already be loaded by trusted host code.
- **Reliability:** storage and media-query APIs are optional runtime capabilities. Failure falls
  back to browser preference or light without making authoring or learner content unavailable.
- **Performance:** token resolution is pure and memoizable by snapshot/catalogue/mode identity.
  Theme changes update bounded custom properties rather than generating per-component stylesheets.
- **Rendering consistency:** content portal hosts and canvas renderers are explicit theme consumers;
  they cannot rely on incidental inheritance from `documentElement`.
- **Payload size:** full snapshots add bounded root-document data but remain small relative to
  existing artifact and learner-content limits.
- **Font loading:** Core bundles only the curated OSS catalogue. A host is responsible for making
  its registered font assets available in both authoring and learner surfaces.

## Alternatives Considered

### Preset ID plus sparse overrides

- **Why it could work:** smallest document payload and simple preset upgrades.
- **Why not:** unchanged fields would resolve from the currently installed preset, silently
  restyling existing courses after an upgrade.
- **Consequence:** rejected in favour of complete versioned snapshots.

### Complete snapshot without checking preset availability

- **Why it could work:** maximum portability; a host theme would continue rendering from saved
  values anywhere.
- **Why not:** it contradicts the approved requirement that unavailable host themes fall back to
  Scaffold Default and may rely on fonts or treatments absent from the new host.
- **Consequence:** saved values are retained but activated only when their preset is available.

### CSS-only host themes

- **Why it could work:** minimal JavaScript surface and natural use of `sc-adapters`.
- **Why not:** CSS cannot supply preset labels, preview metadata, curated fonts, structured defaults,
  reset values, validation, or availability status.
- **Consequence:** typed catalogue extension is the primary host seam; adapter CSS remains a
  secondary host-local styling seam that does not participate in the Theme panel or persistence.

### Persist application and learner modes together

- **Why it could work:** one familiar light/dark setting.
- **Why not:** the authoring modal is an independent application, author preview is temporary, and
  learner mode belongs to the environment.
- **Consequence:** three explicit mode lifecycles share one two-value type but no persistence owner.

### Derive dark values at every render

- **Why it could work:** smaller snapshots and automatic consistency.
- **Why not:** authors cannot independently refine dark values, algorithm updates can change
  published courses, and runtime work repeats unnecessarily.
- **Consequence:** generation happens during authoring and the result is persisted.

### Expose the complete semantic palette

- **Why it could work:** maximum direct control and a one-to-one match with projected CSS tokens.
- **Why not:** the current 47-control surface permits split semantic states, couples authors to
  implementation, and loses dependency/provenance relationships.
- **Consequence:** authors edit a bounded publication palette while the complete semantic palette
  remains persisted rendering output.

### Generate every preset from one source colour

- **Why it could work:** Material Color Utilities demonstrates coherent tonal and light/dark
  generation from key colours.
- **Why not:** spike prototypes substantially changed exact author-entered anchors and the model
  cannot preserve independently designed publication foundations, statuses, and data palettes.
- **Consequence:** presets remain complete curated systems; generation is family-specific behind a
  Scaffold-owned seam.

### Use Adobe Leonardo as the production resolver

- **Why it could work:** its background-relative contrast generation fits adaptive surfaces.
- **Why not:** it does not own Scaffold semantics or preset character, moved author anchors in the
  spike, and its current dependency chain produced unresolved high-severity audit findings.
- **Consequence:** retain its contrast-relative model as design evidence; prefer a narrow
  Scaffold-owned resolver using maintained colour primitives.

## Decisions

- Persist complete, versioned course theme snapshots in Contracts-owned document attributes -
  preserves authored appearance and portability.
- Persist bounded author palette intent and per-slot dark provenance alongside complete snapshots -
  preserves meaningful editing without making runtime output dependent on live generation.
- Treat presets as complete curated systems with closed family recipes - preserves preset identity
  after author customisation.
- Expose four foundation, six creative, and one explicit link author-palette slots in the first
  release - preserves independently useful publication choices established by calibration without
  exposing resolved implementation tokens.
- Keep status families preset-owned and independent from ordinary brand edits - preserves semantic
  meaning.
- Use an immutable built-in-plus-host catalogue rather than global registration side effects -
  matches Core construction patterns and isolates applications.
- Treat preset availability as a rendering gate for host presets while retaining saved values -
  satisfies fallback and recovery requirements.
- Use structured, allowlisted theme values and curated font IDs - prevents arbitrary persisted CSS
  and URL injection.
- Keep Poppins and JetBrains Mono for Scaffold application identity; add Source Serif 4 and Inter
  only to the course font catalogue - makes presets distinct without changing chrome identity.
- Use one pure resolver for all course rendering contexts - editor, preview, learner, overlays, and
  charts cannot drift.
- Keep application, preview, and learner mode lifecycles independent - avoids persisting transient
  environment state.
- Put Core token declarations into `sc-base` and preserve `sc-adapters` as the highest normal Core
  extension layer - completes the layering contract.

## Plan Inputs

- Preserve document v3 loading and theme string/null semantics through a v4 migration; migration
  output must match the current OSS light appearance.
- Treat the five linked model files as contract-first inputs before UI or CSS implementation.
- Treat the frozen eleven-slot palette-resolution model as a contract-first input when expanding
  the Contracts schema.
- Use expand/migrate/contract sequencing: add author inputs and materialisation beside the existing
  resolved palette, migrate authoring commands and consumers, then remove resolved-token editing and
  the palette-wide dark source flag.
- Add dependency-isolation verification: brand edits cannot change status families, one dark edit
  cannot detach unrelated slots, and exact author anchors remain represented.
- Complete chart token propagation and remove brand/status CSS coupling before treating real-block
  visual comparisons as palette acceptance evidence.
- Carry both public learner entry surfaces and both LMS adapters through any colour-mode seam.
- Keep host extension configuration optional and additive; built-ins and fallback must work when it
  is absent or invalid.
- Preserve application/course token separation across normal DOM, owned portal hosts, fullscreen
  slideshow state, and canvas renderers.
- Verify all four authoring application/course-preview combinations and live learner mode changes.
- Review any new font dependency and lockfile change together with its OFL attribution, weight
  subset, payload impact, and install-script policy.
- Keep author-created theme values within schema-bounded primitives; no raw CSS, URLs, or
  user-provided font family strings.
- Adapter-specific LMS mode observation remains an integration responsibility and must degrade to
  Core's browser fallback when unavailable.

## Durable Knowledge Candidates

### LANGUAGE.md

- **Course preset**, **course theme**, **course colour mode**, **authoring application colour mode**,
  **host theme**, and **explicit styling** as defined in the epic requirements.

### DOMAIN.md

- Course themes are persisted authored presentation; colour modes are transient rendering
  environments.
- Existing courses render saved theme snapshots rather than current preset defaults.
- Explicit local styling does not automatically adapt with theme-derived colours.

### ADR

- Versioned full theme snapshots plus an immutable extensible catalogue, instead of sparse overrides
  or CSS-only theme registration.
- Independent application, preview, and learner colour-mode lifecycles over shared semantic token
  projection.

## Open Architecture Questions

- The exact LMS-specific signal and live-update mechanism available in each supported Moodle and
  Open edX deployment remains adapter integration evidence, not a Core blocker. When unavailable,
  browser preference is the required fallback.
- The first-release visual values for density, stroke, shadow, and roundness require design review,
  but their persisted categories and snapshot ownership are settled by the model.
