import type { EmbeddedNodeId } from "@scaffold/contracts";

import type { ControlCapabilityCatalogue } from "./control-capability-catalogue";
import type {
  CommandExecutor,
  ControlBinding,
  ControlBindingRegistry,
  ControlCommandRequest,
  ControlEvent,
  ControlEventListener,
  ControlStateReadRequest,
  EventSource,
  StateReader,
} from "./control-binding";
import type {
  ControlCommandInputDefinition,
  ControlDefinition,
  ControlStateValueTypeDefinition,
  ControlValue,
} from "./control-definition";

export interface CreateControlBindingRegistryInput {
  readonly requireOwnerControlDefinition: ControlCapabilityCatalogue["requireOwnerControlDefinition"];
  readonly requireOwnedTargetCapabilities: ControlCapabilityCatalogue["requireOwnedTargetCapabilities"];
}

interface MountedRegistration {
  readonly ownerId: EmbeddedNodeId;
  binding: ControlBinding | undefined;
  readonly subscriptions: Set<() => void>;
  active: boolean;
}

interface MountedOwnersRequest {
  readonly ownerIds: ReadonlySet<EmbeddedNodeId>;
  listener: (() => void) | undefined;
}

export function createControlBindingRegistry({
  requireOwnerControlDefinition,
  requireOwnedTargetCapabilities,
}: CreateControlBindingRegistryInput): ControlBindingRegistry {
  const registrations = new Map<EmbeddedNodeId, MountedRegistration>();
  const mountedOwnersRequests = new Set<MountedOwnersRequest>();
  let disposed = false;

  function cancelMountedOwnersRequest(request: MountedOwnersRequest): void {
    mountedOwnersRequests.delete(request);
    request.listener = undefined;
  }

  function deliverReadyMountedOwnersRequests(): void {
    let firstDefect: unknown;
    for (const request of [...mountedOwnersRequests]) {
      if (!mountedOwnersRequests.has(request)) continue;
      if (![...request.ownerIds].every((ownerId) => registrations.has(ownerId))) continue;
      const listener = request.listener;
      cancelMountedOwnersRequest(request);
      try {
        listener?.();
      } catch (error) {
        firstDefect ??= error;
      }
    }
    if (firstDefect !== undefined) throw firstDefect;
  }

  const registry: ControlBindingRegistry = {
    register(binding) {
      if (disposed) throw new Error("Cannot register a Control Binding after registry disposal.");
      if (registrations.has(binding.ownerId)) {
        throw new Error(`Duplicate Control Binding for owner "${binding.ownerId}".`);
      }

      const definition = requireOwnerControlDefinition(binding.ownerId);
      assertFacetAgreement(binding, definition);

      const registration: MountedRegistration = {
        ownerId: binding.ownerId,
        binding: undefined,
        subscriptions: new Set(),
        active: true,
      };
      registration.binding = createRegisteredBinding(
        registration,
        binding,
        requireOwnedTargetCapabilities,
      );
      registrations.set(binding.ownerId, registration);
      deliverReadyMountedOwnersRequests();

      let registered = true;
      return () => {
        if (!registered) return;
        registered = false;
        if (registrations.get(binding.ownerId) !== registration) return;
        registrations.delete(binding.ownerId);
        closeRegistration(registration);
      };
    },

    get(ownerId) {
      if (disposed) throw new Error("Cannot use a disposed Control Binding registry.");
      return registrations.get(ownerId)?.binding;
    },

    notifyWhenOwnersMounted(ownerIds, listener) {
      if (disposed) {
        throw new Error("Cannot request Control Binding readiness after registry disposal.");
      }
      const requiredOwnerIds = new Set(ownerIds);
      if ([...requiredOwnerIds].every((ownerId) => registrations.has(ownerId))) {
        listener();
        return () => undefined;
      }

      const request: MountedOwnersRequest = { ownerIds: requiredOwnerIds, listener };
      mountedOwnersRequests.add(request);
      return () => cancelMountedOwnersRequest(request);
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      for (const request of [...mountedOwnersRequests]) cancelMountedOwnersRequest(request);
      const mounted = [...registrations.values()];
      registrations.clear();

      let firstDefect: unknown;
      for (const registration of mounted) {
        try {
          closeRegistration(registration);
        } catch (error) {
          firstDefect ??= error;
        }
      }
      if (firstDefect !== undefined) throw firstDefect;
    },
  };

  return Object.freeze(registry);
}

function createRegisteredBinding(
  registration: MountedRegistration,
  binding: ControlBinding,
  requireOwnedTargetCapabilities: ControlCapabilityCatalogue["requireOwnedTargetCapabilities"],
): ControlBinding {
  return Object.freeze({
    ownerId: binding.ownerId,
    ...(binding.eventSource
      ? {
          eventSource: createRegisteredEventSource(
            registration,
            binding.eventSource,
            requireOwnedTargetCapabilities,
          ),
        }
      : {}),
    ...(binding.stateReader
      ? {
          stateReader: createRegisteredStateReader(
            registration,
            binding.stateReader,
            requireOwnedTargetCapabilities,
          ),
        }
      : {}),
    ...(binding.commandExecutor
      ? {
          commandExecutor: createRegisteredCommandExecutor(
            registration,
            binding.commandExecutor,
            requireOwnedTargetCapabilities,
          ),
        }
      : {}),
  });
}

function createRegisteredEventSource(
  registration: MountedRegistration,
  eventSource: EventSource,
  requireOwnedTargetCapabilities: ControlCapabilityCatalogue["requireOwnedTargetCapabilities"],
): EventSource {
  return Object.freeze({
    subscribe(listener: ControlEventListener) {
      assertActive(registration);
      const underlyingUnsubscribe = eventSource.subscribe((event) => {
        assertActive(registration);
        assertDeclaredEvent(registration.ownerId, event, requireOwnedTargetCapabilities);
        listener(event);
      });

      let subscribed = true;
      const unsubscribe = () => {
        if (!subscribed) return;
        subscribed = false;
        registration.subscriptions.delete(unsubscribe);
        underlyingUnsubscribe();
      };
      registration.subscriptions.add(unsubscribe);
      if (!registration.active) unsubscribe();
      return unsubscribe;
    },
  });
}

function createRegisteredStateReader(
  registration: MountedRegistration,
  stateReader: StateReader,
  requireOwnedTargetCapabilities: ControlCapabilityCatalogue["requireOwnedTargetCapabilities"],
): StateReader {
  return Object.freeze({
    read(request: ControlStateReadRequest) {
      assertActive(registration);
      const capabilities = requireOwnedTargetCapabilities(registration.ownerId, request.targetId);
      const state = capabilities.states?.find((candidate) => candidate.key === request.key);
      if (!state) {
        throw new Error(
          `Control state "${request.key}" is not declared for target "${request.targetId}".`,
        );
      }

      const value = stateReader.read(request);
      assertControlValue(
        value,
        state.valueType,
        () =>
          new Error(
            `Control state "${request.key}" returned an invalid value for target "${request.targetId}".`,
          ),
      );
      assertActive(registration);
      return value;
    },
  });
}

function createRegisteredCommandExecutor(
  registration: MountedRegistration,
  commandExecutor: CommandExecutor,
  requireOwnedTargetCapabilities: ControlCapabilityCatalogue["requireOwnedTargetCapabilities"],
): CommandExecutor {
  return Object.freeze({
    async execute(request: ControlCommandRequest) {
      assertActive(registration);
      const capabilities = requireOwnedTargetCapabilities(registration.ownerId, request.targetId);
      const command = capabilities.commands?.find((candidate) => candidate.type === request.type);
      if (!command) {
        throw new Error(
          `Control command "${request.type}" is not declared for target "${request.targetId}".`,
        );
      }

      const hasInput = Object.hasOwn(request, "input");
      if (!command.input && hasInput) {
        throw new Error(
          `Control command "${request.type}" does not accept input for target "${request.targetId}".`,
        );
      }
      if (command.input && !hasInput) {
        throw new Error(
          `Control command "${request.type}" requires input for target "${request.targetId}".`,
        );
      }
      if (command.input) {
        assertControlCommandInput(
          request.input,
          command.input,
          () =>
            new Error(
              `Control command "${request.type}" received invalid input for target "${request.targetId}".`,
            ),
        );
      }

      const result = await commandExecutor.execute(request);
      assertActive(registration);
      return result;
    },
  });
}

function assertDeclaredEvent(
  ownerId: EmbeddedNodeId,
  event: ControlEvent,
  requireOwnedTargetCapabilities: ControlCapabilityCatalogue["requireOwnedTargetCapabilities"],
): void {
  const capabilities = requireOwnedTargetCapabilities(ownerId, event.targetId);
  if (!capabilities.events?.some((candidate) => candidate.type === event.type)) {
    throw new Error(
      `Control event "${event.type}" is not declared for target "${event.targetId}".`,
    );
  }
}

function assertFacetAgreement(binding: ControlBinding, definition: ControlDefinition): void {
  const capabilitySets = [
    ...(definition.owner ? [definition.owner] : []),
    ...Object.values(definition.semanticChildren ?? {}),
  ];
  assertFacet(
    binding,
    "eventSource",
    capabilitySets.some(({ events }) => events !== undefined),
  );
  assertFacet(
    binding,
    "stateReader",
    capabilitySets.some(({ states }) => states !== undefined),
  );
  assertFacet(
    binding,
    "commandExecutor",
    capabilitySets.some(({ commands }) => commands !== undefined),
  );
}

function assertFacet(
  binding: ControlBinding,
  facet: "eventSource" | "stateReader" | "commandExecutor",
  required: boolean,
): void {
  const present = binding[facet] !== undefined;
  if (required && !present) {
    throw new Error(
      `Control binding for owner "${binding.ownerId}" is missing required ${facet} facet.`,
    );
  }
  if (!required && present) {
    throw new Error(
      `Control binding for owner "${binding.ownerId}" has undeclared ${facet} facet.`,
    );
  }
}

function assertControlCommandInput(
  value: ControlValue | undefined,
  type: ControlCommandInputDefinition,
  createError: () => Error,
): asserts value is ControlValue {
  if (type.kind !== "runtime-bounded-number") {
    assertControlValue(value, type, createError);
    return;
  }
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < type.min ||
    (type.step !== undefined && !isStepAligned(value, type.min, type.step))
  ) {
    throw createError();
  }
}

function assertControlValue(
  value: ControlValue | undefined,
  type: ControlStateValueTypeDefinition,
  createError: () => Error,
): asserts value is ControlValue {
  if (type.kind === "runtime-bounded-number") {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < type.min ||
      (type.step !== undefined && !isStepAligned(value, type.min, type.step))
    ) {
      throw createError();
    }
    return;
  }
  if (type.kind === "boolean") {
    if (typeof value !== "boolean") throw createError();
    return;
  }
  if (type.kind === "enum") {
    if (typeof value !== "string" || !type.options.some((option) => option.value === value)) {
      throw createError();
    }
    return;
  }
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < type.min ||
    value > type.max ||
    (type.step !== undefined && !isStepAligned(value, type.min, type.step))
  ) {
    throw createError();
  }
}

function isStepAligned(value: number, min: number, step: number): boolean {
  const quotient = (value - min) / step;
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(quotient)) * 8;
  return Math.abs(quotient - Math.round(quotient)) <= tolerance;
}

function assertActive(registration: MountedRegistration): void {
  if (!registration.active) {
    throw new Error(`Control Binding for owner "${registration.ownerId}" is no longer mounted.`);
  }
}

function closeRegistration(registration: MountedRegistration): void {
  if (!registration.active) return;
  registration.active = false;
  const subscriptions = [...registration.subscriptions];
  registration.subscriptions.clear();

  let firstDefect: unknown;
  for (const unsubscribe of subscriptions) {
    try {
      unsubscribe();
    } catch (error) {
      firstDefect ??= error;
    }
  }
  if (firstDefect !== undefined) throw firstDefect;
}
