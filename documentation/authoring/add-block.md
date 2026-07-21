# Add A Block

```sh
vp exec node scripts/create-block.mjs --name MyBlock --recipe content
```

Use the scaffolder first. Do not create a block folder by hand unless the scaffolder cannot represent the intended recipe.
Choose the content shape before generating the block. Blocks own authored
content or one atomic widget; layouts own repeated regions that can contain
other blocks.

If the feature is repeated structured content, decide whether it is a course
block with repeated child field nodes or a layout with repeated sections before
choosing this guide. Use a block when each repeated item is owned by one block
and should contain only rich field content. Use a layout when each repeated item
is a content region that can contain other course blocks.

For block-owned repeated items, model every editable item as a real child node.
Do not store repeated authored content in `attrs.data`, and do not build a
parallel SVG/text-slot model. The current supported pattern is stable HTML
NodeViews around `text_content+` child nodes.

## Recipes

| Recipe                 | Use When                                                                                                                                        | Blessed Example                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `content`              | The block owns authored prose or structured content and does not need assessment runtime state.                                                 | `packages/core/src/editor/blocks/presentation/callout`                    |
| `settings-data`        | The block is a content block with a validated `data` or settings surface. Start here when the block is mostly display plus configuration.       | `packages/core/src/editor/blocks/presentation/callout`                    |
| `assessment-composite` | The block is an assessment made of ProseMirror child nodes and private answer-key attrs. Learner responses must not be written to the document. | MCQ: `packages/core/src/editor/blocks/assessment/mcq`                     |
| `shell-widget`         | The block is an assessment shell with one opaque atomic widget child for the interactive surface.                                               | Image Hotspot: `packages/core/src/editor/blocks/assessment/image-hotspot` |
| `media-widget`         | The block is one visible atomic/media widget with structured data and no assessment projection.                                                 | `packages/core/src/editor/blocks/media/image`                             |

These recipe names are canonical. Use the same names in plans, docs, review comments, and generated tests.

## Catalog Category

Every insertable block must choose exactly one `insert.category`. This is a
product discovery category for the slash menu, block strip, and checked insert
catalog.
It is not a ProseMirror content group and must not be used for schema logic.

Use the smallest category that describes why an author would look for the
block:

| Category     | Use When                                                                                                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `content`    | Authored prose, structured notes, definitions, links, or lists that are primarily written content.                                                                                                            |
| `display`    | Editorial presentation blocks whose main value is emphasis, hierarchy, or visual storytelling around existing authored content.                                                                               |
| `media`      | Images, audio, galleries, figures, annotated media, and media/layout hybrids whose primary object is a media asset.                                                                                           |
| `data`       | Tables, charts, code, or other blocks whose primary object is structured data or technical notation.                                                                                                          |
| `assessment` | Graded or answer-key-backed question blocks that use assessment runtime semantics.                                                                                                                            |
| `activity`   | Stateful learner activities that are not answer-key-backed assessments, such as checklists or flashcards.                                                                                                     |
| `embed`      | External provider embeds and provider-specific embed shortcuts.                                                                                                                                               |
| `layout`     | Generic containers that create regions for other course blocks. Shown to authors as “Containers”; use another category when a layout preset is really an activity, display pattern, or media/data experience. |

Do not use `content` as the default bucket for anything that is merely
insertable. If a block exists mostly to make authored material look like a
pull quote, epigraph, stat, or roadmap, use `display`. If it exists around an
image, audio clip, figure, or gallery, use `media`. If it stores learner
progress without an assessment answer key, use `activity`.

## Required Shape

Generated block definitions and lane composition must stay explicit. A
definition is a pure value: importing it must not mutate a registry, lane list,
or insert catalog.

```txt
pure block definitions
        |
        +--> builtInBlockDefinitions --> immutable lookup by nodeType
        +--> authoring extension list --> authoring composition
        +--> runtime extension list   --> runtime composition

definition.insert + explicit non-block actions
        |
        +--> builtInInsertCatalog
```

- Declare metadata through one pure `defineBlock(...)` definition and import it
  into `built-in-block-definitions.ts`.
- Export learner-safe runtime and authoring extension bundles, then add them to
  the arrays returned by `createRuntimeBlockExtensions(...)` in
  `runtime-block-extensions.ts` and `createAuthoringBlockExtensions(...)` in
  `authoring-block-extensions.ts`. Include the parent node and private child
  nodes such as title, item, prompt, term, definition, canvas, or group nodes in
  dependency order inside each bundle.
- Let `built-in-insert-catalog.ts` derive block actions from
  `builtInBlockDefinitions`; do not add import-time or mutable insertion setup.
- Do not add a course block or its private child nodes to the document
  composers. Those files are base editor infrastructure, not block extension
  composition roots.
- Put the parent ProseMirror node in `group: \`block ${COURSE_BLOCK_CONTENT}\``.
- Put provider-neutral persisted schemas in `packages/contracts`. Keep a schema
  in Core only when it has an exact editor-local configuration or Tiptap
  adaptation role; `schemas/` and `configuration/` are not blanket shared
  owners.
- Derive TypeScript types with `z.infer`; do not hand-write sibling payload types.
- Use `stableNodeIdAttribute()` on the parent node and `createStableId()` for
  inserted top-level block ids.
- Use `describeBlockContract(...)` in the generated test.
- Keep the block `index.tsx` as a side-effect-free convenience barrel. It may
  be exported from `packages/core/src/editor/blocks/index.ts`, but that is not
  construction. Runtime composition must use the block runtime extension
  entrypoint, and authoring composition must use the block authoring extension
  entrypoint.
- Put block-specific CSS beside the block. Do not place `.sc-<block>` styling
  in `packages/core/src/styles/globals.css`.
- Normal structured React course blocks must render their parent NodeView with
  `createTiptapResizableReactNodeView(...)`. Plain `ReactNodeViewRenderer(...)`
  is for private child/slot NodeViews and special native textblock children,
  not the selectable parent course block.
- Normal structured visual blocks must declare:

  ```ts
  frame: {
    resizable: true,
    resizeMode: 'responsive',
  }
  ```

- The owned visual block surface must expose
  `courseBlockAuthoringFrameAttributes(...)`. Do not manually create
  `data-authoring-frame-wrapper`; the shared frame wrapper owns that DOM.
- Declare placeholders on the block definition, keyed by the actual owner node
  type. For field slots, use keys such as `callout_title` or
  `pull_quote_body`. For block-container slots, use keys such as
  `comparison_panel` or `marginalia_gutter`, not `paragraph`.

### Runtime / Authoring Files

Every new block must have an explicit definition plus runtime and authoring
extension bundles:

```txt
packages/core/src/editor/blocks/<Block>/
  <block>-definition.ts
  node.ts
  <block>-runtime-extension.tsx
  <block>-authoring-extension.tsx
  <Block>.tsx
  <Block>.test.ts
  index.tsx
```

`<block>-definition.ts` owns pure shared metadata: frame metadata,
placeholders, identity, insert metadata, settings configuration, and
assessment/activity capability metadata.

`<block>-runtime-extension.tsx` owns learner-safe NodeView wiring. It must be
safe for `CourseDocumentViewer` and LMS learner bundles to import.

`<block>-authoring-extension.tsx` owns editor-only NodeView wiring such as
authoring chrome, file pickers, data editors, and other mutation controls.

`index.tsx` is a convenience barrel. Runtime and authoring composition use the
explicit extension bundles, not broad convenience imports.

Every selectable parent course block uses the model factory pattern:

```txt
node.ts             # create<Block>Node({ addNodeView? }), schema-safe
<block>-runtime-extension.tsx
<block>-authoring-extension.tsx
index.tsx
```

Do not import `createTiptapResizableReactNodeView(...)`, settings controls,
interaction target helpers, file pickers, or shell chrome from `node.ts` or
the runtime extension bundle.

Runtime owns learner rendering. Authoring owns editing. Learner preview must use
the runtime extension, not the authoring extension mounted with
`editable=false`.

Do not split every child node automatically. Split private child nodes only
when their NodeView mixes learner rendering with authoring controls such as
add/delete/reorder buttons, correct-answer editing, feedback editing, settings
popovers, file pickers, or mutation controls. Dropdown choices are the reference
example.

Attr ownership must follow the shared model:

| Need                  | Attr/Structure                     |
| --------------------- | ---------------------------------- |
| Stable block identity | `attrs.id` from `createStableId()` |
| Rich authored content | ProseMirror child nodes            |
| Assessment settings   | `attrs.settings`                   |
| Atomic/widget payload | `attrs.data`                       |

Configuration schema ownership:

- `configuration.schema` is always the persisted ProseMirror attr schema.
- Assessment settings use
  `createAssessmentConfiguration({ schema: SomeSettingsSchema, ... })`.
- Use `configuration.editSchema` only when the settings sheet edits a draft
  shape that differs from persisted storage. It must come with `toDraft` and
  `apply`; Chart is the current example.
- Do not add `defineBlockAttrContract`, `attrContracts`, or `attrSchema`.

## Native Text Surfaces

If a block needs `content: 'text*'`, `marks: ''`, `code: true`, or another
native textblock behavior, the top-level Scaffold block must remain an
authoring shell and the text surface must be a private child node.

```txt
code_block          ← Scaffold shell: id, data/settings, menu/frame
  code_block_body   ← private textblock: text*, marks '', code true
```

Do not make the top-level Scaffold block itself a native textblock. That mixes
block chrome and text editing responsibilities and can break caret placement,
selection, bubble menus, and frame state.

Do not keep learner preview behavior in the authoring NodeView behind
`editor.isEditable` or `editable=false`. The preview/learner path must use the
runtime extension. If a generated scaffold still has an explicit implementation
gap, use a throwing function until it is implemented; do not leave passive
comment markers such as TODO, FIXME, or placeholder prose in source.

## Assessment Component Recipe

For `assessment-composite` and `shell-widget` blocks, keep the parent NodeView on the shared assessment path:

- Call `useAssessmentRuntime({ editor: props.editor, getPos: props.getPos, node: props.node })` in the parent block NodeView.
- Render the parent with `ProblemShell`.
- Put authored child content inside the shell with `<NodeViewContent />`.
- Use `AssessmentControls` for submit/retry/attempt UI.
- Use `ShowAnswerButton` only from runtime state after submit when show-answer is available.
- Child NodeViews attach with `useAssessmentRuntimeById(problemId, expectedInteractionKind)` and make learner changes through `runtime.interaction`.
- Block-specific components should not import `useAssessmentStore`, `useAssessmentProblem`, or `useAssessmentBlockSetup`; those are shared runtime infrastructure.

Learner feedback and correctness display must come from runtime feedback/reveal state. Do not read authored answer attrs to decide what the learner sees.

## Commands

After generating the block, run the generated contract test:

```sh
vp run @scaffold/core#test -- MyBlock.test.ts
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

In the browser, insert the block from the slash menu or block strip, select it,
open settings if it has configuration, and confirm both authoring and runtime
facets render without console errors.

## Bans

- Do not add fake future hooks, unused definition slots, or generated files for recipes that do not need them.
- Do not create fake layout or section blocks from block recipes.
- Do not add block extensions to the document composers. Base composers are for
  base editor infrastructure only.
- Do not make a top-level Scaffold block a native `text*` textblock. Use a
  private child textblock inside a Scaffold shell.
- Do not use a block-owned child node when the repeated item needs to contain
  arbitrary course blocks; use a layout section instead.
- Do not use SVG/`foreignObject` as the default repeated-item strategy.
- Do not put block-local `.sc-*` styling in `globals.css`.
- Do not import an authoring convenience barrel from runtime composition.
- Do not put authoring frame wrappers, settings controls, picker modals, or
  editor interaction helpers in a runtime file.
- Do not put the parent course block NodeView on plain
  `ReactNodeViewRenderer(...)` when it is a normal structured visual block.
- Do not write learner assessment responses into the ProseMirror document.
- Do not bypass `describeBlockContract(...)`.
- Do not use passive comment markers for unfinished implementation.
