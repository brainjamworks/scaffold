export const InteractionSelectionMode = {
  AllSelection: "allSelection",
  NodeSelection: "nodeSelection",
  OtherSelection: "otherSelection",
  TextCaret: "textCaret",
  TextRange: "textRange",
} as const;

export type InteractionSelectionMode =
  (typeof InteractionSelectionMode)[keyof typeof InteractionSelectionMode];

export const InteractionOwnerSource = {
  Context: "context",
  Explicit: "explicit",
  Gesture: "gesture",
  Menu: "menu",
  None: "none",
  Selection: "selection",
  Settings: "settings",
} as const;

export type InteractionOwnerSource =
  (typeof InteractionOwnerSource)[keyof typeof InteractionOwnerSource];

export const InteractionActivationIntentKind = {
  AuthoredEditableContent: "authored-editable-content",
  BlankStructuralSpace: "blank-structural-space",
  ExplicitChrome: "explicit-chrome",
  IgnoredInteractive: "ignored-interactive",
  ObjectShell: "object-shell",
  OutsideEditor: "outside-editor",
} as const;

export type InteractionActivationIntentKind =
  (typeof InteractionActivationIntentKind)[keyof typeof InteractionActivationIntentKind];

export const InteractionTargetKind = {
  Block: "block",
  Cell: "cell",
  Field: "field",
  Grid: "grid",
  Layout: "layout",
  Region: "region",
  Section: "section",
  Surface: "surface",
} as const;

export type InteractionTargetKind =
  (typeof InteractionTargetKind)[keyof typeof InteractionTargetKind];

export const InteractionEmbeddedChildSelection = {
  DelegateToParent: "delegate-to-parent",
  Independent: "independent",
} as const;

export type InteractionEmbeddedChildSelection =
  (typeof InteractionEmbeddedChildSelection)[keyof typeof InteractionEmbeddedChildSelection];

export const InteractionChromeSlotReason = {
  Allowed: "allowed",
  InactiveAuthoringSession: "inactive-authoring-session",
  MissingTarget: "missing-target",
  SuppressedByExplicitOwner: "suppressed-by-explicit-owner",
  Unavailable: "unavailable",
} as const;

export type InteractionChromeSlotReason =
  (typeof InteractionChromeSlotReason)[keyof typeof InteractionChromeSlotReason];

export interface InteractionTargetRef {
  id?: string;
  kind: InteractionTargetKind;
  pos?: number;
}

export interface InteractionOwner {
  source: InteractionOwnerSource;
  target: InteractionTargetRef | null;
}

export interface InteractionActivationIntent {
  kind: InteractionActivationIntentKind;
  target: InteractionTargetRef | null;
}

export interface InteractionContextOwners {
  cell: InteractionTargetRef | null;
  grid: InteractionTargetRef | null;
  layout: InteractionTargetRef | null;
  region: InteractionTargetRef | null;
  section: InteractionTargetRef | null;
  surface: InteractionTargetRef | null;
}

export interface InteractionSelectionState {
  mode: InteractionSelectionMode;
  objectSelectedTarget: InteractionTargetRef | null;
  range: {
    empty: boolean;
    from: number;
    to: number;
  };
}

export interface InteractionTargetPolicy {
  embeddedChildSelection: InteractionEmbeddedChildSelection;
  isStructuralContainer: boolean;
  keyboardObjectActions: boolean;
  objectSelectable: boolean;
  supportsArrangementMenu: boolean;
  supportsBlockBubble: boolean;
  supportsFieldControls: boolean;
  supportsMovement: boolean;
  supportsOutline: boolean;
  supportsResize: boolean;
  supportsSettings: boolean;
  target: InteractionTargetRef;
}

export interface InteractionEngineInput {
  activationIntent: InteractionActivationIntent | null;
  authoringChromeSessionActive: boolean;
  contextOwner: InteractionTargetRef | null;
  contextOwners: InteractionContextOwners;
  explicitOwner: InteractionTargetRef | null;
  gestureOwner: InteractionTargetRef | null;
  menuOwner: InteractionTargetRef | null;
  selection: InteractionSelectionState;
  selectionOwner: InteractionTargetRef | null;
  settingsOwner: InteractionTargetRef | null;
  targetPolicies: readonly InteractionTargetPolicy[];
}

export interface InteractionOwnerState {
  contextOwner: InteractionOwner;
  contextOwners: InteractionContextOwners;
  effectiveOwner: InteractionOwner;
  explicitOwner: InteractionOwner;
  gestureOwner: InteractionOwner;
  menuOwner: InteractionOwner;
  selectionOwner: InteractionOwner;
  settingsOwner: InteractionOwner;
}

export interface InteractionChromeSlot {
  reason: InteractionChromeSlotReason;
  target: InteractionTargetRef | null;
  visible: boolean;
}

export interface InteractionChromeSlots {
  arrangementMenu: InteractionChromeSlot;
  blockBubble: InteractionChromeSlot;
  fieldControls: InteractionChromeSlot;
  insertionRow: InteractionChromeSlot;
  movementHandle: InteractionChromeSlot;
  outline: InteractionChromeSlot;
  resizeHandles: InteractionChromeSlot;
  settingsSheet: InteractionChromeSlot;
}

export interface InteractionOwnerSnapshot {
  chromeSlots: InteractionChromeSlots;
  owners: InteractionOwnerState;
  selection: InteractionSelectionState;
}

export const EMPTY_INTERACTION_CONTEXT_OWNERS: InteractionContextOwners = {
  cell: null,
  grid: null,
  layout: null,
  region: null,
  section: null,
  surface: null,
};

export const NO_INTERACTION_OWNER: InteractionOwner = {
  source: InteractionOwnerSource.None,
  target: null,
};

export const DEFAULT_INTERACTION_SELECTION_STATE: InteractionSelectionState = {
  mode: InteractionSelectionMode.OtherSelection,
  objectSelectedTarget: null,
  range: {
    empty: true,
    from: 0,
    to: 0,
  },
};

export function createInteractionTargetRef(input: InteractionTargetRef): InteractionTargetRef {
  return {
    ...(input.id ? { id: input.id } : {}),
    kind: input.kind,
    ...(Number.isInteger(input.pos) ? { pos: input.pos } : {}),
  };
}

export function createInteractionOwner(
  source: InteractionOwnerSource,
  target: InteractionTargetRef | null | undefined,
): InteractionOwner {
  return target ? { source, target } : createNoInteractionOwner();
}

export function sameInteractionTarget(
  left: InteractionTargetRef,
  right: InteractionTargetRef,
): boolean {
  if (left.kind !== right.kind) {
    return false;
  }

  if (left.id || right.id) {
    return left.id === right.id;
  }

  if (Number.isInteger(left.pos) || Number.isInteger(right.pos)) {
    return left.pos === right.pos;
  }

  return false;
}

export function createInteractionActivationIntent(input: {
  kind: InteractionActivationIntentKind;
  target?: InteractionTargetRef | null;
}): InteractionActivationIntent {
  return {
    kind: input.kind,
    target: input.target ?? null,
  };
}

export function createInteractionChromeSlot(
  input: {
    reason?: InteractionChromeSlotReason;
    target?: InteractionTargetRef | null;
    visible?: boolean;
  } = {},
): InteractionChromeSlot {
  return {
    reason: input.reason ?? InteractionChromeSlotReason.MissingTarget,
    target: input.target ?? null,
    visible: input.visible ?? false,
  };
}

export function createInteractionTargetPolicy(input: {
  embeddedChildSelection?: InteractionEmbeddedChildSelection;
  isStructuralContainer?: boolean;
  keyboardObjectActions?: boolean;
  objectSelectable?: boolean;
  supportsArrangementMenu?: boolean;
  supportsBlockBubble?: boolean;
  supportsFieldControls?: boolean;
  supportsMovement?: boolean;
  supportsOutline?: boolean;
  supportsResize?: boolean;
  supportsSettings?: boolean;
  target: InteractionTargetRef;
}): InteractionTargetPolicy {
  return {
    embeddedChildSelection:
      input.embeddedChildSelection ?? InteractionEmbeddedChildSelection.Independent,
    isStructuralContainer: input.isStructuralContainer ?? false,
    keyboardObjectActions: input.keyboardObjectActions ?? false,
    objectSelectable: input.objectSelectable ?? false,
    supportsArrangementMenu: input.supportsArrangementMenu ?? false,
    supportsBlockBubble: input.supportsBlockBubble ?? false,
    supportsFieldControls: input.supportsFieldControls ?? false,
    supportsMovement: input.supportsMovement ?? false,
    supportsOutline: input.supportsOutline ?? false,
    supportsResize: input.supportsResize ?? false,
    supportsSettings: input.supportsSettings ?? false,
    target: createInteractionTargetRef(input.target),
  };
}

export function createInteractionEngineInput(
  input: {
    activationIntent?: InteractionActivationIntent | null;
    authoringChromeSessionActive?: boolean;
    contextOwner?: InteractionTargetRef | null;
    contextOwners?: Partial<InteractionContextOwners>;
    explicitOwner?: InteractionTargetRef | null;
    gestureOwner?: InteractionTargetRef | null;
    menuOwner?: InteractionTargetRef | null;
    selection?: Partial<InteractionSelectionState>;
    selectionOwner?: InteractionTargetRef | null;
    settingsOwner?: InteractionTargetRef | null;
    targetPolicies?: readonly InteractionTargetPolicy[];
  } = {},
): InteractionEngineInput {
  return {
    activationIntent: input.activationIntent ?? null,
    authoringChromeSessionActive: input.authoringChromeSessionActive ?? true,
    contextOwner: input.contextOwner ?? null,
    contextOwners: {
      ...EMPTY_INTERACTION_CONTEXT_OWNERS,
      ...input.contextOwners,
    },
    explicitOwner: input.explicitOwner ?? null,
    gestureOwner: input.gestureOwner ?? null,
    menuOwner: input.menuOwner ?? null,
    selection: createInteractionSelectionState(input.selection),
    selectionOwner: input.selectionOwner ?? null,
    settingsOwner: input.settingsOwner ?? null,
    targetPolicies: input.targetPolicies ?? [],
  };
}

export function resolveEffectiveInteractionOwner(
  owners: Pick<
    InteractionOwnerState,
    | "contextOwner"
    | "contextOwners"
    | "explicitOwner"
    | "gestureOwner"
    | "menuOwner"
    | "selectionOwner"
    | "settingsOwner"
  >,
): InteractionOwner {
  return (
    firstPresentOwner(
      owners.gestureOwner,
      owners.settingsOwner,
      owners.menuOwner,
      owners.explicitOwner,
      owners.contextOwner,
      owners.selectionOwner,
      createInteractionOwner(
        InteractionOwnerSource.Context,
        deepestContextOwner(owners.contextOwners),
      ),
    ) ?? createNoInteractionOwner()
  );
}

export function createEmptyInteractionOwnerSnapshot(): InteractionOwnerSnapshot {
  return {
    chromeSlots: {
      arrangementMenu: createInteractionChromeSlot(),
      blockBubble: createInteractionChromeSlot(),
      fieldControls: createInteractionChromeSlot(),
      insertionRow: createInteractionChromeSlot(),
      movementHandle: createInteractionChromeSlot(),
      outline: createInteractionChromeSlot(),
      resizeHandles: createInteractionChromeSlot(),
      settingsSheet: createInteractionChromeSlot(),
    },
    owners: {
      contextOwner: createNoInteractionOwner(),
      contextOwners: createEmptyInteractionContextOwners(),
      effectiveOwner: createNoInteractionOwner(),
      explicitOwner: createNoInteractionOwner(),
      gestureOwner: createNoInteractionOwner(),
      menuOwner: createNoInteractionOwner(),
      selectionOwner: createNoInteractionOwner(),
      settingsOwner: createNoInteractionOwner(),
    },
    selection: {
      ...DEFAULT_INTERACTION_SELECTION_STATE,
      range: { ...DEFAULT_INTERACTION_SELECTION_STATE.range },
    },
  };
}

export function createInteractionOwnerSnapshot(
  input: {
    chromeSlots?: Partial<InteractionChromeSlots>;
    contextOwner?: InteractionTargetRef | null;
    contextOwners?: Partial<InteractionContextOwners>;
    explicitOwner?: InteractionTargetRef | null;
    gestureOwner?: InteractionTargetRef | null;
    menuOwner?: InteractionTargetRef | null;
    selection?: Partial<InteractionSelectionState>;
    selectionOwner?: InteractionTargetRef | null;
    settingsOwner?: InteractionTargetRef | null;
  } = {},
): InteractionOwnerSnapshot {
  const empty = createEmptyInteractionOwnerSnapshot();
  const contextOwners = {
    ...empty.owners.contextOwners,
    ...input.contextOwners,
  };
  const owners = {
    contextOwner: createInteractionOwner(InteractionOwnerSource.Context, input.contextOwner),
    contextOwners,
    explicitOwner: createInteractionOwner(InteractionOwnerSource.Explicit, input.explicitOwner),
    gestureOwner: createInteractionOwner(InteractionOwnerSource.Gesture, input.gestureOwner),
    menuOwner: createInteractionOwner(InteractionOwnerSource.Menu, input.menuOwner),
    selectionOwner: createInteractionOwner(InteractionOwnerSource.Selection, input.selectionOwner),
    settingsOwner: createInteractionOwner(InteractionOwnerSource.Settings, input.settingsOwner),
  };

  return {
    chromeSlots: {
      ...empty.chromeSlots,
      ...input.chromeSlots,
    },
    owners: {
      ...owners,
      effectiveOwner: resolveEffectiveInteractionOwner(owners),
    },
    selection: {
      ...createInteractionSelectionState(input.selection),
    },
  };
}

function createInteractionSelectionState(
  input: Partial<InteractionSelectionState> | undefined,
): InteractionSelectionState {
  return {
    ...DEFAULT_INTERACTION_SELECTION_STATE,
    ...input,
    range: {
      ...DEFAULT_INTERACTION_SELECTION_STATE.range,
      ...input?.range,
    },
  };
}

function createEmptyInteractionContextOwners(): InteractionContextOwners {
  return {
    ...EMPTY_INTERACTION_CONTEXT_OWNERS,
  };
}

function createNoInteractionOwner(): InteractionOwner {
  return {
    ...NO_INTERACTION_OWNER,
  };
}

function firstPresentOwner(...owners: readonly InteractionOwner[]): InteractionOwner | null {
  return owners.find((owner) => owner.target) ?? null;
}

function deepestContextOwner(owners: InteractionContextOwners): InteractionTargetRef | null {
  return (
    owners.cell ?? owners.grid ?? owners.layout ?? owners.region ?? owners.section ?? owners.surface
  );
}
