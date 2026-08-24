import { NodeViewContent, NodeViewWrapper, useEditorState, type NodeViewProps } from "@tiptap/react";
import { useLayoutEffect, useRef, type ReactNode } from "react";

import { useScrollableBlockSemanticContainerAdapter } from "@/document/authoring/semantic-document/use-scrollable-block-semantic-container-adapter";

import { PROCESS_FLOW_NODE, PROCESS_FLOW_STEP_NODE } from "./content";
import { parseProcessFlowData } from "./ProcessFlowModel";
import {
  readProcessFlowStepPosition,
  readRequiredProcessFlowStepId,
  resolveProcessFlowData,
} from "./process-flow-view-helpers";
import "./ProcessFlow.css";

export function ProcessFlowView({ footer, props }: { footer?: ReactNode; props: NodeViewProps }) {
  const data = parseProcessFlowData(props.node.attrs["data"]);
  const scrollportRef = useRef<HTMLDivElement>(null);

  useScrollableBlockSemanticContainerAdapter({
    axis: data.orientation,
    childNodeType: PROCESS_FLOW_STEP_NODE,
    editor: props.editor,
    getChildElement: (childId) => processFlowStepElementById(scrollportRef.current, childId),
    getPos: props.getPos,
    getScrollOwner: () => scrollportRef.current,
    node: props.node,
    ownerId: props.node.attrs["id"],
    ownerNodeType: PROCESS_FLOW_NODE,
  });

  useLayoutEffect(() => {
    const scrollport = scrollportRef.current;
    if (!scrollport) return;

    const updateOverflow = () => {
      const hasOverflow =
        data.orientation === "horizontal"
          ? scrollport.scrollWidth > scrollport.clientWidth + 1
          : scrollport.scrollHeight > scrollport.clientHeight + 1;
      if (hasOverflow) {
        scrollport.setAttribute("data-process-flow-scrollable", data.orientation);
        scrollport.setAttribute("tabindex", "0");
      } else {
        scrollport.removeAttribute("data-process-flow-scrollable");
        scrollport.removeAttribute("tabindex");
      }
    };

    updateOverflow();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateOverflow);
    observer?.observe(scrollport);
    const rail = scrollport.firstElementChild;
    if (rail) observer?.observe(rail);
    window.addEventListener("resize", updateOverflow);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateOverflow);
    };
  }, [data.orientation, props.node.childCount]);

  return (
    <section
      aria-label="Process flow"
      className="sc-course-process-flow"
      data-orientation={data.orientation}
      data-show-connectors={data.showConnectors ? "true" : "false"}
      data-show-numbers={data.showNumbers ? "true" : "false"}
    >
      <div ref={scrollportRef} className="sc-course-process-flow__scrollport">
        <div className="sc-course-process-flow__rail">
          <NodeViewContent<"div">
            as="div"
            role="list"
            aria-label="Process steps"
            className="sc-course-process-flow__steps"
          />
          {footer ?? null}
        </div>
      </div>
    </section>
  );
}

export function ProcessFlowRuntimeView(props: NodeViewProps) {
  return <ProcessFlowView props={props} />;
}

export function ProcessFlowStepRuntimeView(props: NodeViewProps) {
  const { index } = useEditorState({
    editor: props.editor,
    selector: () => readProcessFlowStepPosition(props),
  });
  const data = useEditorState({
    editor: props.editor,
    selector: () => resolveProcessFlowData(props),
  });
  const stepId = readRequiredProcessFlowStepId(props.node.attrs["id"]);

  return (
    <NodeViewWrapper
      role="listitem"
      data-node="process-flow-step"
      data-process-flow-step-id={stepId}
      className="sc-course-process-flow__step"
    >
      <ProcessFlowStepCard number={data.showNumbers ? index : null}>
        <NodeViewContent />
      </ProcessFlowStepCard>
    </NodeViewWrapper>
  );
}

function processFlowStepElementById(
  scrollport: HTMLElement | null,
  childId: string,
): HTMLElement | null {
  if (!scrollport) return null;
  return (
    Array.from(scrollport.querySelectorAll<HTMLElement>("[data-process-flow-step-id]")).find(
      (candidate) => candidate.dataset.processFlowStepId === childId,
    ) ?? null
  );
}

export function ProcessFlowStepCard({
  children,
  chrome,
  number,
  surfaceProps,
}: {
  children: ReactNode;
  chrome?: ReactNode;
  number: number | null;
  surfaceProps?: Record<string, string>;
}) {
  return (
    <div {...surfaceProps} className="sc-course-process-flow__card">
      {number !== null || chrome ? (
        <div contentEditable={false} className="sc-course-process-flow__header">
          {number !== null ? (
            <span aria-hidden className="sc-course-process-flow__number">
              {number}
            </span>
          ) : null}
          {chrome}
        </div>
      ) : null}
      <div className="sc-course-process-flow__content">{children}</div>
    </div>
  );
}
