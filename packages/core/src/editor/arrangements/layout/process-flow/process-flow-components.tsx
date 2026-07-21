import type { ReactNode } from "react";

export interface ProcessFlowOptions {
  showNumbers: boolean;
  showConnectors: boolean;
  orientation: "horizontal" | "vertical";
}

export interface ProcessFlowSectionPosition {
  index: number;
  isLast: boolean;
}

export function readProcessFlowOptions(value: unknown): ProcessFlowOptions {
  const raw =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    showNumbers: raw["showNumbers"] === true,
    showConnectors: raw["showConnectors"] !== false,
    orientation: raw["orientation"] === "vertical" ? "vertical" : "horizontal",
  };
}

export function readRequiredProcessFlowNodeId(
  value: unknown,
  nodeType: "layout" | "section",
): string {
  if (typeof value === "string" && value.length > 0) return value;
  throw new Error(`${nodeType} node is missing a stable id.`);
}

export function ProcessFlowTrack({
  children,
  options,
}: {
  children: ReactNode;
  options?: ProcessFlowOptions;
}) {
  return (
    <div
      className="sc-process-flow sc-process-flow__track"
      data-orientation={options?.orientation}
      data-show-connectors={options ? (options.showConnectors ? "true" : "false") : undefined}
      data-show-numbers={options ? (options.showNumbers ? "true" : "false") : undefined}
    >
      {children}
    </div>
  );
}

export function ProcessFlowNumber({ value }: { value: number }) {
  return (
    <div contentEditable={false} aria-hidden className="sc-process-flow__number">
      <span className="sc-process-flow__number-value">{value}</span>
    </div>
  );
}

export function ProcessFlowContent({
  children,
  editable,
  isLast,
}: {
  children: ReactNode;
  editable?: boolean;
  isLast?: boolean;
}) {
  return (
    <div
      className="sc-process-flow__content"
      data-editable={editable ? "true" : undefined}
      data-is-last={isLast ? "true" : undefined}
    >
      {children}
    </div>
  );
}
