import { CalloutDataSchema, type CalloutData, type CalloutVariant } from "@scaffold/contracts";
import { NodeViewContent, type NodeViewProps } from "@tiptap/react";
import type { ReactNode } from "react";

import { IconRenderer } from "@/ui/icons/IconRenderer";
import { catalogIconValue, type IconValue } from "@/schemas/media/icon";

import { emptyCalloutData } from "./content";

import "./Callout.css";

const variantLabels: Record<CalloutVariant, string> = {
  info: "Info",
  warning: "Warning",
  success: "Success",
  error: "Error",
  tip: "Tip",
  note: "Note",
};

const calloutVariantIcons: Record<CalloutVariant, IconValue> = {
  info: catalogIconValue("info"),
  warning: catalogIconValue("alert-triangle"),
  success: catalogIconValue("check-circle"),
  error: catalogIconValue("x-circle"),
  tip: catalogIconValue("lightbulb"),
  note: catalogIconValue("file-text"),
};

function parseCalloutData(value: unknown): CalloutData {
  const parsed = CalloutDataSchema.safeParse(value);
  return parsed.success ? parsed.data : emptyCalloutData();
}

function normalizeCalloutData(next: Partial<CalloutData>): CalloutData {
  return CalloutDataSchema.parse(next);
}

function calloutIconClassName(interactive: boolean): string {
  return interactive
    ? "sc-course-callout__icon-slot sc-app-callout-icon-trigger"
    : "sc-course-callout__icon-slot sc-course-callout__icon-chip";
}

function courseStateForVariant(
  variant: CalloutVariant,
): "info" | "warning" | "success" | "error" | undefined {
  if (variant === "info" || variant === "warning" || variant === "success" || variant === "error") {
    return variant;
  }
  return undefined;
}

export interface CalloutIconControlProps {
  className: string;
  fallbackValue: IconValue;
  value: IconValue | null;
  onValueChange: (icon: IconValue | null) => void;
}

export type CalloutIconControlRenderer = (props: CalloutIconControlProps) => ReactNode;

function StaticCalloutIcon({ data }: { data: CalloutData }) {
  if (!data.showIcon) return null;

  const fallbackValue = calloutVariantIcons[data.variant];

  return (
    <span className={calloutIconClassName(false)} aria-hidden>
      <IconRenderer
        value={data.icon}
        fallbackValue={fallbackValue}
        className="sc-course-callout__icon-glyph"
      />
    </span>
  );
}

export function CalloutView({
  editable,
  props,
  renderIconControl,
}: {
  editable: boolean;
  props: NodeViewProps;
  renderIconControl?: CalloutIconControlRenderer;
}) {
  const data = parseCalloutData(props.node.attrs["data"]);

  const updateData = (patch: Partial<CalloutData>) => {
    props.updateAttributes({
      data: normalizeCalloutData({ ...data, ...patch }),
    });
  };

  const title = props.node.firstChild?.textContent.trim() ?? "";
  const label = variantLabels[data.variant];
  const icon: ReactNode =
    editable && data.showIcon && renderIconControl ? (
      renderIconControl({
        className: calloutIconClassName(true),
        fallbackValue: calloutVariantIcons[data.variant],
        value: data.icon,
        onValueChange: (icon) => updateData({ icon }),
      })
    ) : (
      <StaticCalloutIcon data={data} />
    );

  return (
    <aside
      role="note"
      aria-label={title ? `${label}: ${title}` : `${label} callout`}
      className="sc-course-callout"
      data-callout-variant={data.variant}
      data-course-state={courseStateForVariant(data.variant)}
    >
      <div className="sc-course-callout__layout">
        {icon}
        <div className="sc-course-callout__content">
          <NodeViewContent />
        </div>
      </div>
    </aside>
  );
}
