import { ResourceLinkDataSchema, type ResourceLinkKind } from "@scaffold/contracts";
import { NodeViewContent, type NodeViewProps } from "@tiptap/react";

import {
  useLearningEventReporter,
  type LearningEventReporter,
} from "@/runtime/learning-events/LearningEventRuntimeProvider";

import { emptyResourceLinkData } from "./content";
import { useResourceLinkControlBinding } from "./resource-link-control-binding";
import { ResourceLinkSurface } from "./ResourceLinkSurface";

export type ResourceLinkLearningReporter = Pick<LearningEventReporter, "report">;

export function deliverAcceptedResourceLinkActivation({
  learningEventReporter,
  publishControl,
  resourceId,
  resourceKind,
}: {
  readonly learningEventReporter: ResourceLinkLearningReporter;
  readonly publishControl: () => void;
  readonly resourceId: unknown;
  readonly resourceKind: ResourceLinkKind;
}): void {
  if (typeof resourceId !== "string" || !resourceId.trim()) return;
  let controlFailed = false;
  let controlDefect: unknown;
  try {
    publishControl();
  } catch (error) {
    controlFailed = true;
    controlDefect = error;
  }
  try {
    learningEventReporter.report({
      type: "resource.launched",
      resourceId,
      resourceKind,
    });
  } catch {
    // Resource launch recording is observational and cannot prevent navigation.
  }
  if (controlFailed) throw controlDefect;
}

export function ResourceLinkRuntimeView(props: NodeViewProps) {
  const parsed = ResourceLinkDataSchema.safeParse(props.node.attrs["data"]);
  const data = parsed.success ? parsed.data : emptyResourceLinkData();
  const learningEventReporter = useLearningEventReporter();
  const publishControl = useResourceLinkControlBinding({
    editor: props.editor,
    getPos: props.getPos,
    node: props.node,
  });
  const resourceId = props.node.attrs["id"];
  const recordLaunch = () =>
    deliverAcceptedResourceLinkActivation({
      learningEventReporter,
      publishControl,
      resourceId,
      resourceKind: data.kind,
    });

  return (
    <ResourceLinkSurface data={data} editable={false} onOpen={recordLaunch}>
      <NodeViewContent />
    </ResourceLinkSurface>
  );
}
