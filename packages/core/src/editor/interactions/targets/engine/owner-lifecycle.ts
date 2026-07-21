import {
  InteractionActivationIntentKind,
  type InteractionEngineInput,
} from "../model/interaction-owner-state";

export function applyInteractionOwnerLifecycle(
  input: InteractionEngineInput,
): InteractionEngineInput {
  const intent = input.activationIntent;

  if (!intent) {
    return input;
  }

  switch (intent.kind) {
    case InteractionActivationIntentKind.AuthoredEditableContent:
      return {
        ...input,
        explicitOwner: null,
      };

    case InteractionActivationIntentKind.BlankStructuralSpace:
    case InteractionActivationIntentKind.ExplicitChrome:
      return intent.target
        ? {
            ...input,
            explicitOwner: intent.target,
          }
        : input;

    case InteractionActivationIntentKind.ObjectShell:
      return {
        ...input,
        explicitOwner: null,
      };

    case InteractionActivationIntentKind.OutsideEditor:
      return {
        ...input,
        explicitOwner: null,
        gestureOwner: null,
        menuOwner: null,
        settingsOwner: null,
      };

    case InteractionActivationIntentKind.IgnoredInteractive:
      return input;
  }
}
