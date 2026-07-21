# Interaction Targets

`editor/interactions/targets` is the canonical Scaffold interaction-owner
system. Its framework-free model and engine turn normalized selection facts,
explicit authoring intent, target policies, and document context into the
read-only snapshot consumed by editor chrome. Framework adapters depend on that
pure kernel through exact declaring leaves.

## Authority Chain

```txt
DOM event
-> activation intent
-> ProseMirror transaction and interaction command meta
-> owner plugin state
-> normalized engine input
-> owner lifecycle and invariants
-> InteractionOwnerSnapshot
-> facade store and chrome consumers
```

ProseMirror owns caret, text range, object selection, document operations,
history, and collaboration. Scaffold owns semantic interaction intent such as
the active structural owner, open menu, settings target, and gesture target.

`InteractionOwnerSnapshot` is the public read model. Its `selection` field is
limited to ProseMirror facts: `mode`, `range`, and `objectSelectedTarget`.
Scaffold owner state lives under `owners`.

## Directory Shape

```txt
targets/
  model/                 framework-free target, selection, owner, and snapshot types
  engine/                framework-free owner resolution, lifecycle, and chrome policy
  facade/
    vanilla/             editor-owned external store and command surface
    react/               provider and subscription hooks over the vanilla store
  prosemirror/
    activation/          DOM intent classification and transaction dispatch
    facade/              command ports, store lookup, and snapshot publication
    projection/          EditorState/document facts -> engine input and descriptors
    state/               owner plugin state and command metadata
    interaction-owner-extension.ts
                           Tiptap extension and event integration
```

Dependencies point inward: ProseMirror and React adapters may consume the
framework-free model, engine, and vanilla facade; the pure kernel never imports
from those adapters. There is intentionally no `targets` or `targets/facade`
aggregate entrypoint. Consumers import the exact module that declares the
symbol they use.

## Ownership Model

Explicit interaction state is deliberately small:

- `explicitOwner`
- `menuOwner`
- `settingsOwner`
- `gestureOwner`
- `activationIntent`

The engine combines that state with ProseMirror selection and document context
to resolve `selectionOwner`, `contextOwners`, `effectiveOwner`, and
`chromeSlots`.

Target capabilities come from `targetPolicies`; target kind alone is not a
complete policy. Missing policy is invalid at the engine boundary. Stable-id
references are re-resolved after document changes, while position-identity
references are mapped or dropped.

## Activation

`resolveInteractionActivationIntentFromMouseDown` classifies authored editable
content, blank structural space, explicit chrome, ignored controls, object
shells, and outside-editor interaction. It performs no dispatch.

`applyInteractionActivationIntent` applies one interaction command transaction
for a handled intent. Structural activation does not create structural
`NodeSelection`; object shells select real selectable blocks only. Escape and
outside-editor interaction dismiss ephemeral owners through the same command
boundary.

## Projection And Chrome

Projection modules read raw selection through `editor/selection`. They do not
interpret ProseMirror selection classes directly.

Block and structural descriptor projections resolve target references against
the live document using position-first id validation. Chrome consumers read
published slots rather than walking DOM ancestry or reconstructing owner
policy locally.

The vanilla facade store is editor-owned. `CourseDocumentEditor` provides one
store to both `ScaffoldInteractionOwnerExtension` and
`InteractionProvider` so plugin publication, commands, and React
subscriptions share one identity. ProseMirror publication and storage adapters
live under `prosemirror/facade`; React bindings live under `facade/react`.

## Invariants

- Selection facts never contain Scaffold owner state.
- Chrome visibility does not imply object selection.
- Object selection does not imply menu or settings state.
- Structural containers are not keyboard delete/copy objects.
- Managed embedded children delegate passive ownership to their parent.
- Independent embedded children remain owned by the child block.
- Read-model helpers do not dispatch, perform DOM effects, or repair state.
- Chrome consumers do not rediscover target ownership locally.
- Consumers import exact declaring leaves rather than aggregate target barrels.
- There is no compatibility target model or parallel interaction engine.

## Verification

```sh
vp run @scaffold/core#test src/editor/interactions/targets
vp run @scaffold/core#test src/editor/selection
vp run verify:types
vp run verify:architecture
```
