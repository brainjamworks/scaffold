import { NodeViewContent, NodeViewWrapper, useEditorState, type NodeViewProps } from "@tiptap/react";
import { useLayoutEffect, useRef, type ReactNode } from "react";

import { parseProcessFlowData } from "./ProcessFlowModel";
import { readProcessFlowStepPosition, resolveProcessFlowData } from "./process-flow-view-helpers";
import "./ProcessFlow.css";

export function ProcessFlowView({ footer, props }: { footer?: ReactNode; props: NodeViewProps }) {
  const data = parseProcessFlowData(props.node.attrs["data"]);
  const scrollportRef = useRef<HTMLDivElement>(null);

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
      } else {
        scrollport.removeAttribute("data-process-flow-scrollable");
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
          <NodeViewContent<"ol">
            as="ol"
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

  return (
    <NodeViewWrapper
      as="li"
      data-node="process-flow-step"
      className="sc-course-process-flow__step"
    >
      <ProcessFlowStepCard number={data.showNumbers ? index : null}>
        <NodeViewContent />
      </ProcessFlowStepCard>
    </NodeViewWrapper>
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
