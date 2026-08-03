# `@scaffold/core`

Core is Scaffold's platform-neutral React/Tiptap authoring and learner-runtime package. It owns the
editor, runtime renderers, built-in blocks, Course theme definitions, and host port interfaces. It
does not own persistence, LMS protocols, private branding, or arbitrary host CSS.

## Theming boundary

A persisted Course theme and application appearance are different concepts:

- `theme` belongs to the Course document. It contains exact, versioned references to one built-in
  design and one built-in colour system, plus strict sparse non-colour overrides.
- Scaffold owns the design and colour-system registries and their definitions. Integrations do not
  inject visual definitions, presets, fonts, CSS strings, or generator callbacks.
- Persisted Course state does not contain resolved style data, copied definition values, or an
  application appearance setting.
- An unavailable exact reference remains explicit until the author deliberately selects or resets
  to a supported value; it is not silently replaced.
- Authoring application mode belongs to the author's local Scaffold preference.
- Course Preview mode is temporary authoring-session state.
- Learner mode comes from the host when supplied and otherwise follows the browser preference.

Course presentation is applied through a scoped Course boundary. Page, Slideshow, charts, and
Course-owned overlays consume the selected design and colour system. Scaffold chrome and app-owned
overlays retain application appearance. Explicit authored presentation remains separate.

## Generic extensions

`@scaffold/core/extensions` remains the supported entrypoint for generic block, layout, and surface
extension contracts. Those content-structure extensions are independent of the application-owned
Course design and colour-system registries.

## Supported imports

Use the role-based package entrypoints:

```ts
import { ... } from "@scaffold/core/authoring";
import { ... } from "@scaffold/core/runtime";
import { ... } from "@scaffold/core/format";
import { ... } from "@scaffold/core/ports";
import { ... } from "@scaffold/core/extensions";
import "@scaffold/core/styles.css";
```
