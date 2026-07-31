# `@scaffold/core`

Core is Scaffold's platform-neutral React/Tiptap authoring and learner-runtime package. It owns the
editor, runtime renderers, built-in blocks, course theme resolution, and host port interfaces. It
does not own persistence, LMS protocols, private branding, or arbitrary host CSS.

## Theming boundary

A persisted course theme and a Scaffold colour mode are different concepts:

- `theme` belongs to the course document. It contains publication author inputs, recipe
  provenance, typography/design choices, and complete resolved light/dark snapshots.
- Authoring application mode belongs to the author's local Scaffold preference.
- Course Preview mode is temporary authoring-session state.
- Learner mode comes from the host when supplied and otherwise follows the browser preference.

Authors edit eleven publication colour roles: four foundation roles, six creative roles, and link.
The versioned preset recipe materialises those exact anchors into the larger semantic token set.
Information, success, warning, and error families remain preset-owned. Core does not warn about or
block valid author colours with poor contrast.

Course presentation is applied through a scoped custom-property boundary. Page, Slideshow, charts,
and course-owned overlays consume the resolved course theme. Scaffold chrome and app-owned
overlays remain application-themed. Explicit authored presentation is preserved.

## Host extensions

`ScaffoldAuthoringEntry`, `ScaffoldLearnerApp`, and `ContentRuntimeHost` accept an optional
`themeExtension`. A host may contribute validated structured preset and font definitions. The seam
does not accept CSS strings or generator callbacks.

When a saved host preset is unavailable, learner runtime silently renders Scaffold Default without
mutating the saved snapshot. Restoring the extension restores the saved course appearance.

```tsx
import { ScaffoldAuthoringEntry } from "@scaffold/core/authoring";
import type { ScaffoldThemeExtension } from "@scaffold/core/authoring";

const themeExtension: ScaffoldThemeExtension = {
  presets: [hostPresetDefinition],
  fonts: [hostFontDefinition],
};

<ScaffoldAuthoringEntry artifact={artifact} services={services} themeExtension={themeExtension} />;
```

Hosts remain responsible for making any declared font assets available. Private themes and branding
are host-owned data and are not shipped by Core.

## Supported imports

Use the role-based package entrypoints:

```ts
import { ... } from "@scaffold/core/authoring";
import { ... } from "@scaffold/core/runtime";
import { ... } from "@scaffold/core/format";
import { ... } from "@scaffold/core/ports";
import "@scaffold/core/styles.css";
```
