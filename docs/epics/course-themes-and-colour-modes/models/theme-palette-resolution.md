# Model: Theme Palette Resolution

**Kind:** module interface
**Status:** draft
**Owner:** Core theme model
**Used by:** built-in and host presets, theme-authoring commands, persisted-theme materialisation,
course-theme resolver
**Guidance:** author-palette spike, Material Color Utilities, Adobe Leonardo, Radix Colors, Fluent
colour tokens, Carbon themes, Spectrum colour system, DTCG Resolver 2025.10

## Purpose

Separate the bounded publication colours authors understand from the complete semantic colour
values Scaffold components require. A preset supplies complete designed defaults plus versioned
family policies; authoring materialises those inputs into stable light and dark snapshots.

## Shape

```ts
type CourseThemeColorMode = "light" | "dark";
type CourseThemePaletteSlot =
  | "background"
  | "surface"
  | "bodyText"
  | "headingText"
  | "primary"
  | "secondary"
  | "accent1"
  | "accent2"
  | "accent3"
  | "accent4"
  | "link";

type CourseThemeCreativeSlot =
  | "primary"
  | "secondary"
  | "accent1"
  | "accent2"
  | "accent3"
  | "accent4";

type CourseThemeCreativeSlots = readonly [
  "primary",
  "secondary",
  "accent1",
  "accent2",
  "accent3",
  "accent4",
];

type AuthorPalette = Readonly<Record<CourseThemePaletteSlot, CssColor>>;

interface DarkAuthorPalette {
  sourceBySlot: Readonly<Record<CourseThemePaletteSlot, "derived" | "custom">>;
  values: AuthorPalette;
}

interface CourseThemePaletteRecipe {
  id: string;
  version: number;
  creativeSlots: CourseThemeCreativeSlots;
  linkSource: "explicit";
  mappings: CourseThemeSemanticMappings;
  foundation: CourseThemeFoundationRecipe;
  creative: CourseThemeCreativeRecipe;
  status: CourseThemeStatusFamilies;
  data: CourseThemeDataRecipe;
}

interface MaterialisedCoursePalette {
  author: {
    light: AuthorPalette;
    dark: DarkAuthorPalette;
  };
  recipe: {
    id: string;
    version: number;
  };
  resolved: {
    light: CourseThemeColorPalette;
    dark: CourseThemeColorPalette;
  };
}

interface CoursePaletteResolver {
  materialise(input: {
    recipe: CourseThemePaletteRecipe;
    light: AuthorPalette;
    dark: DarkAuthorPalette;
  }): MaterialisedCoursePalette;
}
```

`CourseThemeSemanticMappings`, foundation/creative recipes, status families, and data recipe are
closed Core-owned schema objects. They may contain allowlisted tone selections, source-slot
references, and bounded generation parameters. They never contain executable callbacks, CSS
property names, arbitrary expressions, or library-specific model objects.

The first-release author palette has eleven slots: four foundation roles, six creative roles, and
one explicit link role. Every recipe exposes the same six creative slots. Presets provide their
defaults and dependency recipes; they do not reduce the persisted or authorable slot set.

## First-Release Dependency Ownership

| Author input                                | Exact anchor                   | Resolver-owned dependants                                                                         | Must not change              |
| ------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------- | ---------------------------- |
| `background`, `surface`                     | The selected foundation colour | Related neutral surfaces, borders, overlays, and foundation-relative tone selection               | Preset status hue families   |
| `bodyText`, `headingText`                   | The selected text colour       | Related muted text and text hierarchy roles                                                       | Creative and status families |
| `primary`, `secondary`, `accent1`–`accent4` | The selected creative colour   | On-colours, containers, interaction tones, focus mappings, and declared data-series contributions | Preset status hue families   |
| `link`                                      | The selected link colour       | Link hover, active, visited, and focus treatments                                                 | Primary action colour        |

All eleven values exist independently in both light and dark author palettes. The explicit link
slot is not derived from primary: calibration showed that inline-link legibility and emphasis must
remain adjustable independently from solid actions. The four accent slots remain because each was
visibly useful across Default, Editorial, and Minimal and together the six creative roles provide a
stable publication and data palette.

## Invariants

- Author palette slots and resolved semantic roles are different contracts.
- An explicit author colour remains an exact reference colour in its family.
- Derived roles may select related tones where their semantic use requires it.
- Primary, secondary, and accent edits cannot change status-family hue ownership.
- A foundation edit may change tone selection for status roles against the new surface without
  replacing the preset-owned status family.
- Every preset supplies complete light and dark status families and a complete data strategy.
- The resolver is pure and deterministic for the same typed inputs and recipe version.
- Runtime rendering consumes persisted resolved snapshots and does not execute palette generation.
- Dark provenance is recorded per slot; customising one dark slot does not detach unrelated slots.
- The recipe and persisted schema use Scaffold vocabulary rather than Culori, Material, Leonardo,
  or another implementation library's types.

## Lifecycle

1. Selecting or resetting a preset copies its default author palettes and materialised semantic
   snapshots.
2. A light author edit replaces one slot and rematerialises both the light result and any
   corresponding dark slot still marked derived.
3. A dark author edit replaces one dark slot and marks only that slot custom.
4. Resetting a dark slot restores the preset-derived value and provenance for that slot.
5. Resetting the dark palette restores derived provenance for every dark slot.
6. The resulting author inputs, recipe provenance, and complete semantic snapshots are written in
   one course-document transaction.
7. Editor, preview, and learner runtime select the saved light or dark snapshot without generation.

## Validation And Errors

- Every author slot uses the bounded `CssColor` primitive.
- Recipe IDs and versions are validated before catalogue inclusion.
- Recipe mappings may reference only declared author slots and semantic targets.
- Recipe construction must produce every `CourseThemeColorPalette` field for both modes.
- Invalid or incomplete recipes exclude a host preset; built-in recipe failure is a build/test
  failure.
- Resolver failure during authoring leaves the last valid theme snapshot intact.
- Author-created poor contrast remains valid and receives no warning.

## Compatibility

The resolver implementation may use Culori for colour parsing and perceptual operations, but
library behaviour is isolated behind the versioned Core interface. Changing tone curves, gamut
mapping, mappings, or recipe meaning requires a new recipe version.

Existing materialised themes migrate by treating their complete semantic values as the preserved
rendering snapshot. Migration supplies author palette inputs from the corresponding visible
semantic anchors where possible; subsequent intentional edits use the current versioned recipe.

## Open Questions

- Exact closed recipe parameter shapes still require implementation calibration for tone curves,
  gamut mapping, and interaction-tone selection. They cannot change the frozen eleven-slot
  author-facing contract.
