import { ResourceLinkDataSchema } from "@scaffold/contracts";
import { NodeViewContent, type NodeViewProps } from "@tiptap/react";

import { useLearningEventReporter } from "@/runtime/learning-events/LearningEventRuntimeProvider";

import { emptyResourceLinkData } from "./content";
import { ResourceLinkSurface } from "./ResourceLinkSurface";

export function ResourceLinkRuntimeView(props: NodeViewProps) {
  const parsed = ResourceLinkDataSchema.safeParse(props.node.attrs["data"]);
  const data = parsed.success ? parsed.data : emptyResourceLinkData();
  const learningEventReporter = useLearningEventReporter();
  const resourceId = props.node.attrs["id"];
  const recordLaunch = () => {
    if (typeof resourceId !== "string" || !resourceId.trim()) return;
    try {
      learningEventReporter.report({
        type: "resource.launched",
        resourceId,
        resourceKind: data.kind,
      });
    } catch {
      // Resource launch recording is observational and cannot prevent navigation.
    }
  };

  return (
    <ResourceLinkSurface data={data} editable={false} onOpen={recordLaunch}>
      <NodeViewContent />
    </ResourceLinkSurface>
  );
}
