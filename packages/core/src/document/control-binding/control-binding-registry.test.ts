import type { EmbeddedNodeId } from "@scaffold/contracts";
import { Result } from "better-result";
import { describe, expect, it, vi } from "vite-plus/test";

import type { SemanticDefinitionLookup } from "@/document/model/semantic-document/definition-lookup";
import type {
  SemanticDocumentSnapshot,
  SemanticItem,
} from "@/document/model/semantic-document/semantic-document-snapshot";
import { createControlCapabilityCatalogue } from "./control-capability-catalogue";
import type {
  ControlCapabilitySetDefinition,
  ControlDefinition,
  ControlValue,
} from "./control-definition";
import { normalizeControlDefinition } from "./control-definition";
import type {
  CommandExecutor,
  ControlBinding,
  ControlCommandError,
  ControlCommandRequest,
  ControlEvent,
  EventSource,
  StateReader,
} from "./control-binding";
import { createControlBindingRegistry } from "./control-binding-registry";

const OWNER_ID = "controlowner01" as EmbeddedNodeId;
const OTHER_OWNER_ID = "controlowner02" as EmbeddedNodeId;
const CHILD_ID = "controlchild01" as EmbeddedNodeId;
const FOREIGN_CHILD_ID = "controlchild02" as EmbeddedNodeId;

const FULL_CONTROL = control({
  owner: {
    events: [{ type: "submitted", label: "Submitted" }],
    states: [{ key: "ready", label: "Ready", valueType: { kind: "boolean" } }],
    commands: [{ type: "reset", label: "Reset" }],
  },
  semanticChildren: {
    section: {
      events: [{ type: "selected", label: "Selected" }],
      states: [
        {
          key: "mode",
          label: "Mode",
          valueType: {
            kind: "enum",
            options: [
              { value: "compact", label: "Compact" },
              { value: "expanded", label: "Expanded" },
            ],
          },
        },
        {
          key: "progress",
          label: "Progress",
          valueType: { kind: "number", min: 0, max: 10, step: 2, unitLabel: "%" },
        },
      ],
      commands: [
        {
          type: "select",
          label: "Select",
          input: {
            kind: "enum",
            options: [
              { value: "compact", label: "Compact" },
              { value: "expanded", label: "Expanded" },
            ],
          },
        },
      ],
    },
  },
});
const OWNER_CAPABILITIES = FULL_CONTROL.owner!;

describe("ControlBindingRegistry", () => {
  it("uses the catalogue target map to validate an exact semantic child", () => {
    const child = semanticItem(CHILD_ID, "published-child", "section", "controlled_block");
    const owner = semanticItem(OWNER_ID, "block", "controlled_block", "controlled_block", [child]);
    const snapshot = Object.freeze({
      revision: 1,
      mode: "page",
      roots: Object.freeze([owner]),
      itemById: new Map([
        [OWNER_ID, owner],
        [CHILD_ID, child],
      ]),
      parentById: new Map([
        [OWNER_ID, null],
        [CHILD_ID, OWNER_ID],
      ]),
      locationById: new Map(),
      diagnostics: Object.freeze([]),
    }) satisfies SemanticDocumentSnapshot;
    const definitions = Object.freeze({
      blocks: Object.freeze({
        get: (nodeType: string) =>
          nodeType === "controlled_block"
            ? Object.freeze({
                nodeType,
                title: "Controlled block",
                isAssessment: false,
                control: FULL_CONTROL,
              })
            : undefined,
      }),
      layouts: Object.freeze({ get: () => undefined }),
      surfaces: Object.freeze({ get: () => undefined }),
    }) satisfies SemanticDefinitionLookup;
    const catalogue = createControlCapabilityCatalogue({ snapshot, definitions });
    const source = createEventSource();
    const registry = createControlBindingRegistry({
      requireOwnerControlDefinition: (ownerId) => catalogue.requireOwnerControlDefinition(ownerId),
      requireOwnedTargetCapabilities: (ownerId, targetId) =>
        catalogue.requireOwnedTargetCapabilities(ownerId, targetId),
    });
    registry.register({ ownerId: OWNER_ID, ...bindingFacets(), eventSource: source.eventSource });
    const listener = vi.fn();
    requireBinding(registry.get(OWNER_ID)).eventSource!.subscribe(listener);

    source.emit({ targetId: CHILD_ID, type: "selected" });

    expect(listener).toHaveBeenCalledWith({ targetId: CHILD_ID, type: "selected" });
  });

  it("wraps every declared facet and validates exact owner and semantic-child capabilities", async () => {
    const source = createEventSource();
    let stateValue: ControlValue = true;
    const stateReader: StateReader = {
      read: vi.fn(() => stateValue),
    };
    const execute = vi.fn(async () => Result.ok());
    const commandExecutor: CommandExecutor = { execute };
    const registry = registryFor(FULL_CONTROL);

    registry.register({
      ownerId: OWNER_ID,
      eventSource: source.eventSource,
      stateReader,
      commandExecutor,
    });
    const binding = requireBinding(registry.get(OWNER_ID));
    const listener = vi.fn();
    source.emit({ targetId: OWNER_ID, type: "submitted" });
    binding.eventSource?.subscribe(listener);
    expect(listener).not.toHaveBeenCalled();

    source.emit({ targetId: OWNER_ID, type: "submitted" });
    source.emit({ targetId: CHILD_ID, type: "selected" });
    expect(listener.mock.calls.map(([event]) => event)).toEqual([
      { targetId: OWNER_ID, type: "submitted" },
      { targetId: CHILD_ID, type: "selected" },
    ]);

    expect(binding.stateReader?.read({ targetId: OWNER_ID, key: "ready" })).toBe(true);
    stateValue = "compact";
    expect(binding.stateReader?.read({ targetId: CHILD_ID, key: "mode" })).toBe("compact");
    stateValue = 4;
    expect(binding.stateReader?.read({ targetId: CHILD_ID, key: "progress" })).toBe(4);

    const reset = commandRequest(OWNER_ID, "reset");
    const select = commandRequest(CHILD_ID, "select", "expanded");
    await expect(binding.commandExecutor?.execute(reset)).resolves.toSatisfy((result) =>
      result.isOk(),
    );
    await expect(binding.commandExecutor?.execute(select)).resolves.toSatisfy((result) =>
      result.isOk(),
    );
    expect(execute).toHaveBeenNthCalledWith(1, reset);
    expect(execute).toHaveBeenNthCalledWith(2, select);
  });

  it("requires every aggregate facet and rejects every undeclared extra facet", () => {
    const fullFacets = bindingFacets();

    for (const missing of ["eventSource", "stateReader", "commandExecutor"] as const) {
      const registry = registryFor(FULL_CONTROL);
      const binding = { ownerId: OWNER_ID, ...fullFacets };
      delete binding[missing];
      expect(() => registry.register(binding)).toThrow(
        `Control binding for owner "${OWNER_ID}" is missing required ${missing} facet.`,
      );
      expect(registry.get(OWNER_ID)).toBeUndefined();
    }

    const eventOnly = control({ owner: { events: OWNER_CAPABILITIES.events! } });
    expect(() =>
      registryFor(eventOnly).register({
        ownerId: OWNER_ID,
        eventSource: createEventSource().eventSource,
        stateReader: bindingFacets().stateReader,
      }),
    ).toThrow(`Control binding for owner "${OWNER_ID}" has undeclared stateReader facet.`);
    expect(() =>
      registryFor(eventOnly).register({
        ownerId: OWNER_ID,
        eventSource: createEventSource().eventSource,
        commandExecutor: bindingFacets().commandExecutor,
      }),
    ).toThrow(`Control binding for owner "${OWNER_ID}" has undeclared commandExecutor facet.`);

    const stateOnly = control({ owner: { states: OWNER_CAPABILITIES.states! } });
    expect(() =>
      registryFor(stateOnly).register({
        ownerId: OWNER_ID,
        stateReader: bindingFacets().stateReader,
        eventSource: createEventSource().eventSource,
      }),
    ).toThrow(`Control binding for owner "${OWNER_ID}" has undeclared eventSource facet.`);
  });

  it("mounts an event-only owner without placeholder state or command facets", () => {
    const source = createEventSource();
    const registry = registryFor(control({ owner: { events: OWNER_CAPABILITIES.events! } }));
    registry.register({ ownerId: OWNER_ID, eventSource: source.eventSource });
    const binding = requireBinding(registry.get(OWNER_ID));
    const listener = vi.fn();

    binding.eventSource?.subscribe(listener);
    source.emit({ targetId: OWNER_ID, type: "submitted" });

    expect(listener).toHaveBeenCalledWith({ targetId: OWNER_ID, type: "submitted" });
    expect(binding.stateReader).toBeUndefined();
    expect(binding.commandExecutor).toBeUndefined();
  });

  it("mounts a state-only owner without placeholder event or command facets", () => {
    const registry = registryFor(control({ owner: { states: OWNER_CAPABILITIES.states! } }));
    registry.register({ ownerId: OWNER_ID, stateReader: { read: () => true } });
    const binding = requireBinding(registry.get(OWNER_ID));

    expect(binding.stateReader?.read({ targetId: OWNER_ID, key: "ready" })).toBe(true);
    expect(binding.eventSource).toBeUndefined();
    expect(binding.commandExecutor).toBeUndefined();
  });

  it("mounts a command-only owner without placeholder event or state facets", async () => {
    const execute = vi.fn(async () => Result.ok());
    const registry = registryFor(control({ owner: { commands: OWNER_CAPABILITIES.commands! } }));
    registry.register({ ownerId: OWNER_ID, commandExecutor: { execute } });
    const binding = requireBinding(registry.get(OWNER_ID));
    const request = commandRequest(OWNER_ID, "reset");

    const result = await binding.commandExecutor?.execute(request);

    expect(result?.isOk()).toBe(true);
    expect(execute).toHaveBeenCalledWith(request);
    expect(binding.eventSource).toBeUndefined();
    expect(binding.stateReader).toBeUndefined();
  });

  it("keeps passive owners unmounted instead of accepting placeholder bindings", () => {
    const registry = createControlBindingRegistry({
      requireOwnerControlDefinition: () => {
        throw new Error(`Control owner "${OWNER_ID}" has no Control Definition.`);
      },
      requireOwnedTargetCapabilities: () => {
        throw new Error(`Control owner "${OWNER_ID}" has no Control Definition.`);
      },
    });

    expect(registry.get(OWNER_ID)).toBeUndefined();
    expect(() => registry.register({ ownerId: OWNER_ID })).toThrow(
      `Control owner "${OWNER_ID}" has no Control Definition.`,
    );
    expect(registry.get(OWNER_ID)).toBeUndefined();
  });

  it("rejects foreign and undeclared Event Source occurrences without swallowing listener defects", () => {
    const source = createEventSource();
    const registry = registryFor(control({ owner: { events: OWNER_CAPABILITIES.events! } }));
    registry.register({ ownerId: OWNER_ID, eventSource: source.eventSource });
    const eventSource = requireBinding(registry.get(OWNER_ID)).eventSource!;
    const defect = new Error("broken event listener");
    eventSource.subscribe((event) => {
      if (event.type === "submitted") throw defect;
    });

    expect(() => source.emit({ targetId: OWNER_ID, type: "submitted" })).toThrow(defect);
    expect(() => source.emit({ targetId: OWNER_ID, type: "undeclared" })).toThrow(
      `Control event "undeclared" is not declared for target "${OWNER_ID}".`,
    );
    expect(() => source.emit({ targetId: FOREIGN_CHILD_ID, type: "submitted" })).toThrow(
      `Control target "${FOREIGN_CHILD_ID}" does not belong to owner "${OWNER_ID}".`,
    );
  });

  it("rejects undeclared state reads and returned values outside the exact bounded declaration", () => {
    let stateValue: ControlValue = true;
    const registry = registryFor(FULL_CONTROL);
    registry.register({
      ownerId: OWNER_ID,
      ...bindingFacets(),
      stateReader: { read: () => stateValue },
    });
    const reader = requireBinding(registry.get(OWNER_ID)).stateReader!;

    expect(() => reader.read({ targetId: FOREIGN_CHILD_ID, key: "ready" })).toThrow(
      `Control target "${FOREIGN_CHILD_ID}" does not belong to owner "${OWNER_ID}".`,
    );
    expect(() => reader.read({ targetId: OWNER_ID, key: "mode" })).toThrow(
      `Control state "mode" is not declared for target "${OWNER_ID}".`,
    );

    stateValue = "yes";
    expect(() => reader.read({ targetId: OWNER_ID, key: "ready" })).toThrow(
      `Control state "ready" returned an invalid value for target "${OWNER_ID}".`,
    );
    stateValue = "missing";
    expect(() => reader.read({ targetId: CHILD_ID, key: "mode" })).toThrow(
      `Control state "mode" returned an invalid value for target "${CHILD_ID}".`,
    );
    stateValue = 3;
    expect(() => reader.read({ targetId: CHILD_ID, key: "progress" })).toThrow(
      `Control state "progress" returned an invalid value for target "${CHILD_ID}".`,
    );
  });

  it("rejects foreign, undeclared and invalid command requests before delegation", async () => {
    const execute = vi.fn(async () => Result.ok());
    const registry = registryFor(FULL_CONTROL);
    registry.register({ ownerId: OWNER_ID, ...bindingFacets(), commandExecutor: { execute } });
    const executor = requireBinding(registry.get(OWNER_ID)).commandExecutor!;

    await expect(executor.execute(commandRequest(FOREIGN_CHILD_ID, "reset"))).rejects.toThrow(
      `Control target "${FOREIGN_CHILD_ID}" does not belong to owner "${OWNER_ID}".`,
    );
    await expect(executor.execute(commandRequest(OWNER_ID, "select"))).rejects.toThrow(
      `Control command "select" is not declared for target "${OWNER_ID}".`,
    );
    await expect(executor.execute(commandRequest(OWNER_ID, "reset", true))).rejects.toThrow(
      `Control command "reset" does not accept input for target "${OWNER_ID}".`,
    );
    await expect(executor.execute(commandRequest(CHILD_ID, "select"))).rejects.toThrow(
      `Control command "select" requires input for target "${CHILD_ID}".`,
    );
    await expect(executor.execute(commandRequest(CHILD_ID, "select", "missing"))).rejects.toThrow(
      `Control command "select" received invalid input for target "${CHILD_ID}".`,
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it("validates runtime-bounded numeric command input without inventing a static maximum", async () => {
    const execute = vi.fn(async () => Result.ok());
    const registry = registryFor(
      control({
        owner: {
          commands: [
            {
              type: "seek-to",
              label: "Seek to",
              input: { kind: "runtime-bounded-number", min: 0, unitLabel: "seconds" },
            },
          ],
        },
      }),
    );
    registry.register({ ownerId: OWNER_ID, commandExecutor: { execute } });
    const executor = requireBinding(registry.get(OWNER_ID)).commandExecutor!;

    await expect(executor.execute(commandRequest(OWNER_ID, "seek-to", 86_400))).resolves.toSatisfy(
      (result) => result.isOk(),
    );
    for (const invalid of [-1, Number.NaN, Number.POSITIVE_INFINITY, "12"]) {
      await expect(
        executor.execute(commandRequest(OWNER_ID, "seek-to", invalid as ControlValue)),
      ).rejects.toThrow(
        `Control command "seek-to" received invalid input for target "${OWNER_ID}".`,
      );
    }
    expect(execute).toHaveBeenCalledOnce();
  });

  it("validates a declared runtime-bounded numeric state without requiring its private live maximum", () => {
    let pageNumber: ControlValue = 2;
    const registry = registryFor(
      control({
        owner: {
          states: [
            {
              key: "page-number",
              label: "Page number",
              valueType: {
                kind: "runtime-bounded-number",
                min: 1,
                unitLabel: "page",
                step: 1,
              },
            },
          ],
        },
      } as never),
    );
    registry.register({ ownerId: OWNER_ID, stateReader: { read: () => pageNumber } });
    const reader = requireBinding(registry.get(OWNER_ID)).stateReader!;

    expect(reader.read({ targetId: OWNER_ID, key: "page-number" })).toBe(2);
    pageNumber = 100_000;
    expect(reader.read({ targetId: OWNER_ID, key: "page-number" })).toBe(100_000);
    for (const invalid of [0, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "2"]) {
      pageNumber = invalid as ControlValue;
      expect(() => reader.read({ targetId: OWNER_ID, key: "page-number" })).toThrow(
        `Control state "page-number" returned an invalid value for target "${OWNER_ID}".`,
      );
    }
  });

  it("preserves each demonstrated reason-specific media command failure", () => {
    const errors = [
      { reason: "cancelled" },
      { reason: "playback-not-allowed" },
      { reason: "media-unavailable", mediaErrorCode: 4 },
      { reason: "seek-out-of-range", requestedSeconds: 61, durationSeconds: 60 },
      { reason: "page-out-of-range", requestedPage: 6, pageCount: 5 },
      { reason: "pdf-unavailable", requestedPage: 2 },
    ] as const satisfies readonly ControlCommandError[];

    expect(errors).toEqual([
      { reason: "cancelled" },
      { reason: "playback-not-allowed" },
      { reason: "media-unavailable", mediaErrorCode: 4 },
      { reason: "seek-out-of-range", requestedSeconds: 61, durationSeconds: 60 },
      { reason: "page-out-of-range", requestedPage: 6, pageCount: 5 },
      { reason: "pdf-unavailable", requestedPage: 2 },
    ]);
  });

  it("preserves asynchronous success, expected cancellation and unexpected executor defects", async () => {
    const cancelled = Result.err(Object.freeze({ reason: "cancelled" as const }));
    const defect = new Error("broken feature authority");
    let outcome: "ok" | "cancelled" | "defect" = "ok";
    const registry = registryFor(FULL_CONTROL);
    registry.register({
      ownerId: OWNER_ID,
      ...bindingFacets(),
      commandExecutor: {
        execute: async () => {
          if (outcome === "cancelled") return cancelled;
          if (outcome === "defect") throw defect;
          return Result.ok();
        },
      },
    });
    const executor = requireBinding(registry.get(OWNER_ID)).commandExecutor!;

    await expect(executor.execute(commandRequest(OWNER_ID, "reset"))).resolves.toSatisfy((result) =>
      result.isOk(),
    );
    outcome = "cancelled";
    const cancelledResult = await executor.execute(commandRequest(OWNER_ID, "reset"));
    expect(cancelledResult).toBe(cancelled);
    expect(cancelledResult.isErr()).toBe(true);
    if (cancelledResult.isOk()) throw new Error("Expected command cancellation.");
    expect(cancelledResult.error).toEqual({ reason: "cancelled" });
    expect(Object.isFrozen(cancelledResult.error)).toBe(true);
    outcome = "defect";
    await expect(executor.execute(commandRequest(OWNER_ID, "reset"))).rejects.toBe(defect);
  });

  it("uses ordinary mounted membership with exact duplicate and matching unregister rules", () => {
    const registry = registryFor(FULL_CONTROL);
    const first = binding(OWNER_ID);
    const second = binding(OWNER_ID);
    const unregisterFirst = registry.register(first);
    const firstRegistered = registry.get(OWNER_ID);

    expect(firstRegistered).toBeDefined();
    expect(registry.get(OTHER_OWNER_ID)).toBeUndefined();
    expect(() => registry.register(second)).toThrow(
      `Duplicate Control Binding for owner "${OWNER_ID}".`,
    );

    unregisterFirst();
    unregisterFirst();
    const unregisterSecond = registry.register(second);
    const secondRegistered = registry.get(OWNER_ID);
    unregisterFirst();
    expect(secondRegistered).toBeDefined();
    expect(registry.get(OWNER_ID)).toBe(secondRegistered);
    unregisterSecond();
    expect(registry.get(OWNER_ID)).toBeUndefined();
  });

  it("isolates registries that mount the same owner ID", () => {
    const firstRegistry = registryFor(FULL_CONTROL);
    const secondRegistry = registryFor(FULL_CONTROL);

    firstRegistry.register(binding(OWNER_ID));
    secondRegistry.register(binding(OWNER_ID));

    expect(firstRegistry.get(OWNER_ID)).toBeDefined();
    expect(secondRegistry.get(OWNER_ID)).toBeDefined();
    expect(firstRegistry.get(OWNER_ID)).not.toBe(secondRegistry.get(OWNER_ID));
  });

  it("closes registry-owned subscriptions and rejects every stale wrapper after unregister", async () => {
    const source = createEventSource();
    const registry = registryFor(FULL_CONTROL);
    const unregister = registry.register({
      ownerId: OWNER_ID,
      ...bindingFacets(),
      eventSource: source.eventSource,
    });
    const mounted = requireBinding(registry.get(OWNER_ID));
    const unsubscribe = mounted.eventSource!.subscribe(vi.fn());
    expect(source.listenerCount()).toBe(1);

    unregister();
    expect(source.listenerCount()).toBe(0);
    unsubscribe();
    unsubscribe();
    expect(() => mounted.eventSource!.subscribe(vi.fn())).toThrow(
      `Control Binding for owner "${OWNER_ID}" is no longer mounted.`,
    );
    expect(() => mounted.stateReader!.read({ targetId: OWNER_ID, key: "ready" })).toThrow(
      `Control Binding for owner "${OWNER_ID}" is no longer mounted.`,
    );
    await expect(
      mounted.commandExecutor!.execute(commandRequest(OWNER_ID, "reset")),
    ).rejects.toThrow(`Control Binding for owner "${OWNER_ID}" is no longer mounted.`);
  });

  it("disposes idempotently, rejects later membership use and invalidates in-flight commands", async () => {
    let complete!: () => void;
    const pending = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const source = createEventSource();
    const registry = registryFor(FULL_CONTROL);
    registry.register({
      ownerId: OWNER_ID,
      ...bindingFacets(),
      eventSource: source.eventSource,
      commandExecutor: { execute: async () => (await pending, Result.ok()) },
    });
    const mounted = requireBinding(registry.get(OWNER_ID));
    mounted.eventSource!.subscribe(vi.fn());
    const execution = mounted.commandExecutor!.execute(commandRequest(OWNER_ID, "reset"));

    registry.dispose();
    registry.dispose();
    complete();

    expect(source.listenerCount()).toBe(0);
    expect(() => registry.get(OWNER_ID)).toThrow("Cannot use a disposed Control Binding registry.");
    expect(() => registry.register(binding(OTHER_OWNER_ID))).toThrow(
      "Cannot register a Control Binding after registry disposal.",
    );
    await expect(execution).rejects.toThrow(
      `Control Binding for owner "${OWNER_ID}" is no longer mounted.`,
    );
  });
});

function registryFor(control: ControlDefinition) {
  function requireOwnerControlDefinition(ownerId: EmbeddedNodeId): ControlDefinition {
    if (ownerId !== OWNER_ID) throw new Error(`Control owner "${ownerId}" is not public.`);
    return control;
  }
  function requireOwnedTargetCapabilities(
    ownerId: EmbeddedNodeId,
    targetId: EmbeddedNodeId,
  ): ControlCapabilitySetDefinition {
    if (ownerId !== OWNER_ID) throw new Error(`Control owner "${ownerId}" is not public.`);
    if (targetId === OWNER_ID && control.owner) return control.owner;
    if (targetId === CHILD_ID && control.semanticChildren?.["section"]) {
      return control.semanticChildren["section"];
    }
    throw new Error(`Control target "${targetId}" does not belong to owner "${ownerId}".`);
  }

  return createControlBindingRegistry({
    requireOwnerControlDefinition,
    requireOwnedTargetCapabilities,
  });
}

function binding(ownerId: EmbeddedNodeId): ControlBinding {
  return { ownerId, ...bindingFacets() };
}

function bindingFacets(): Required<Omit<ControlBinding, "ownerId">> {
  return {
    eventSource: createEventSource().eventSource,
    stateReader: { read: () => true },
    commandExecutor: { execute: async () => Result.ok() },
  };
}

function requireBinding(binding: ControlBinding | undefined): ControlBinding {
  if (!binding) throw new Error("Expected a mounted Control Binding.");
  return binding;
}

function commandRequest(
  targetId: EmbeddedNodeId,
  type: string,
  ...input: readonly [ControlValue] | readonly []
): ControlCommandRequest {
  return {
    targetId,
    type,
    ...(input.length === 0 ? {} : { input: input[0] }),
    signal: new AbortController().signal,
  };
}

function createEventSource(): {
  readonly eventSource: EventSource;
  emit(event: ControlEvent): void;
  listenerCount(): number;
} {
  const listeners = new Set<(event: ControlEvent) => void>();
  return {
    eventSource: {
      subscribe(listener) {
        listeners.add(listener);
        let subscribed = true;
        return () => {
          if (!subscribed) return;
          subscribed = false;
          listeners.delete(listener);
        };
      },
    },
    emit(event) {
      for (const listener of listeners) listener(event);
    },
    listenerCount: () => listeners.size,
  };
}

function semanticItem(
  itemId: EmbeddedNodeId,
  kind: SemanticItem["kind"],
  nodeType: string,
  definitionId: string | null,
  children: readonly SemanticItem[] = [],
): SemanticItem {
  return Object.freeze({
    id: itemId,
    kind,
    nodeType,
    definitionId,
    label: nodeType,
    summary: null,
    presentation: Object.freeze({ actionIds: Object.freeze([]), disabledReason: null }),
    presentationContainer: null,
    children: Object.freeze(children),
  });
}

function control(definition: ControlDefinition): ControlDefinition {
  const normalized = normalizeControlDefinition(definition);
  if (!normalized) throw new Error("Expected a Control Definition fixture.");
  return normalized;
}
