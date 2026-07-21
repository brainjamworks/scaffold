# Add A Layout

```sh
vp exec node scripts/create-layout.mjs --name MyLayout --section-label "Section" --add-label "Add section"
```

Use the scaffolder first. Layouts are structural arrangements, not blocks, so
do not add block definitions for layout or section nodes. Layouts use one pure
shared definition plus separate authoring and runtime view bindings.
Choose the content shape before generating the layout. Layouts own repeated
regions that can contain other course blocks; blocks own repeated fields or
atomic widgets.

Use a layout for repeated structured content when each repeated item is a
content region. A layout owns repeated `section` nodes, and each section accepts
normal `block+` content, including course blocks. If each repeated item is only
an internal rich field owned by one course block, use [Add A Block](./add-block.md)
instead.

If a layout visually pairs or groups content regions, keep the document model
as generic sibling sections and let the layout renderer interpret the sequence.
For example, a two-column comparison can render even-indexed sections as the
left column and odd-indexed sections as the right column. Do not introduce a
new content group, private comparison cell nodes, or a repair plugin just to
make the visual grouping easier.

## Layout Construction

Each layout exports one pure `LayoutDefinition` from its feature folder:

```txt
packages/core/src/editor/arrangements/layout/<layout>/<layout>-definition.tsx
```

The explicit built-in definition list constructs an immutable lookup keyed by
the persisted layout variant:

```txt
packages/core/src/editor/arrangements/layout/model/built-in-layout-definitions.ts
```

Authoring and runtime each own an explicit, immutable view registry:

```txt
packages/core/src/editor/arrangements/layout/authoring/built-in-layout-views.ts
packages/core/src/editor/arrangements/layout/runtime/built-in-layout-views.ts
```

The authoring insert catalog derives layout actions from
`builtInLayoutDefinitions`. Importing a definition must not mutate a definition
registry, view registry, or insert catalog.

Generated layout folders keep learner-safe runtime views beside authoring
views:

```txt
packages/core/src/editor/arrangements/layout/<layout>/
  <layout>-definition.tsx   # pure shared definition
  <layout>-content.ts       # JSON content factories
  <layout>-views.tsx        # authoring NodeViews and native chrome
  <layout>-runtime-views.tsx # learner-safe NodeViews
  <layout>.test.ts          # describeLayoutContract(...)
```

The shared ProseMirror node types stay `layout` and `section`. The layout kind is stored on `layout.attrs.variant`, and section children are created by the owning layout definition. Do not use `layout.attrs.kind`.

## Blessed Examples

| Layout                                                                    | Use As                                                                                                                    |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Tabs: `packages/core/src/editor/arrangements/layout/layouts/tabs`         | Native section chrome around tab triggers, add ghost as the next tab item, and section panels as editable content fields. |
| Timeline: `packages/core/src/editor/arrangements/layout/layouts/timeline` | Layout-specific visual rhythm with section items rendered in the layout's natural flow.                                   |

## Required Shape

- Export one pure `LayoutDefinition`; never create a block definition for a
  layout or section.
- Add the definition to `builtInLayoutDefinitions`.
- Add the authoring binding to `builtInLayoutAuthoringViews` and the runtime
  binding to `builtInLayoutRuntimeViews`.
- Let `built-in-non-block-inserts.ts` derive the layout insert action from the
  built-in definitions.
- Create layout content in `<layout>-content.ts`.
- Put authoring views and native chrome in `<layout>-views.tsx`.
- Put learner-safe views in `<layout>-runtime-views.tsx`.
- Use `createStableId()` for the layout container id.
- Use `createStableId()` for section item ids.
- Store the layout kind in `layout.attrs.variant`; it must match `defineLayout.id`.
- Put layout-level settings in `layout.attrs.options`.
- Put section-level settings in `section.attrs.options`.
- Put section creation in the owning layout definition.
- Use `describeLayoutContract(...)` in the generated test.
- Use plain layout NodeViews. Do not use the resizable block frame wrapper.
- Do not add root document spacing in layout-local CSS. Layout/grid document
  rhythm is owned by the shared `[data-authoring-frame="layout"]` /
  `[data-authoring-frame="grid"]` CSS contract. Layout CSS should own internal
  layout only. If a layout genuinely needs a larger outer rhythm, set
  `--authoring-frame-margin-block` on the layout root.

## Runtime Views

Runtime layout views must render the learner experience only. They may use
`NodeViewWrapper`, `NodeViewContent`, layout-local CSS, and learner interaction
state such as tabs/accordion open state. They must not import authoring chrome,
authoring-frame helpers, drag handles, settings sheets, insert controls, or
`LayoutAddGhost`.

Runtime roots should expose stable semantic/debug attributes:

```tsx
<NodeViewWrapper
  data-node="layout"
  data-definition="process-flow"
  data-id={layoutId}
  data-layout-kind="process-flow"
>
  <NodeViewContent />
</NodeViewWrapper>
```

Section runtime views follow the same rule with `data-node="section"`.

## Native Authoring Chrome

Layout-level chrome belongs to the layout container:

- `LayoutOutlineChrome`
- `LayoutMenuTrigger`
- `LayoutAddGhost`

These components have a DOM contract. The layout root must expose the shared
layout group and structural authoring frame attributes:

```tsx
<NodeViewWrapper
  data-layout-kind="process-flow"
  {...structuralAuthoringFrameAttributes({
    definition: props.definition?.id ?? "process-flow",
    id: layoutId,
    nodeType: "layout",
    targetType: InteractionTargetType.Layout,
  })}
  {...authoringChromeActiveAttributes(showLayoutOutline)}
  className="sc-process-flow group/layout group/process-flow relative rounded-sm"
>
  <LayoutOutlineChrome />
  <LayoutMenuTrigger />
  ...
</NodeViewWrapper>
```

`LayoutOutlineChrome` and `LayoutMenuTrigger` rely on
`group-hover/layout`, `group-focus-within/layout`, and
`group-data-[authoring-chrome-active]/layout`. If the root only uses a
layout-specific group such as `group/process-flow`, the chrome will render but
stay invisible and non-interactive.

## Add Ghost Contract

Every authoring layout add affordance must be `LayoutAddGhost`. The shared
component owns the dashed border, plus-in-circle, radius, text treatment, hover
state, focus state, and disabled behavior.

The layout owns placement only:

```tsx
<LayoutAddGhost
  editor={props.editor}
  getPos={props.getPos}
  label="Add step"
  layoutId={layoutId}
  presentation="flow-item"
  className="sc-process-flow__add"
/>
```

```css
.sc-process-flow__add {
  min-width: 0;
  aspect-ratio: 1 / 1;
}
```

Do not hand-roll add buttons or reskin the shared ghost:

```tsx
// Wrong
<button className="sc-process-flow__add">Add step</button>

// Wrong
<LayoutAddGhost className="rounded-lg border border-dashed px-4 py-3" />
```

If the ghost needs to fit a layout flow, choose a supported presentation:
`inline`, `full-width`, `flow-item`, `tab`, `tab-pills`, or `tab-underline`.
Add a new presentation to `LayoutAddGhost` before adding one-off ghost styling
to a layout.

Section-level chrome belongs near the section's native item UI:

- `SectionMovementHandle`
- `SectionActionTrigger`

Do not add a generic section outline. Do not auto-open layout or section bubble menus from selection. Menus open from explicit arrangement triggers. The add ghost should render as the next item in the layout flow, not as unrelated floating chrome.

## Commands

After generating the layout, run the generated contract test:

```sh
vp run @scaffold/core#test -- my-layout.test.ts
```

Run the architecture check:

```sh
vp run verify:architecture
```

Run typecheck:

```sh
vp run verify:types
```

Run a browser smoke:

```sh
vp run dev:playground
```

In the browser, insert the layout from the layout insert path, hover the layout, open the layout menu from the explicit trigger, add a section with the add ghost, open a section menu from its native item UI, and confirm editing inside the section still works.
Then switch to learner preview and confirm the runtime layout view renders
without authoring chrome.

## Bans

- Do not create fake block definitions for layouts or sections.
- Do not use `createTiptapResizableReactNodeView`, block frame helpers, or resize-frame DOM in layout source.
- Do not put section creation outside the owning layout definition.
- Do not render shared layout chrome without `group/layout` on the root.
- Do not add `my-4` or bespoke `margin-block` rules to layout roots. Use the
  shared authoring-frame rhythm contract.
- Do not hand-roll or reskin layout add chrome. Use `LayoutAddGhost` and keep
  layout-specific classes placement-only.
- Do not use layout sections for small block-owned fields that only need
  `text_content`; those belong inside the owning course block.
- Do not add generic section outlines.
- Do not render one-off section chrome outside the layout kind's native item UI.
- Do not import authoring chrome, settings controls, drag handles, interaction
  targets, or layout add ghosts from runtime layout views.
- Do not bypass `describeLayoutContract(...)`.
