import { CalloutDataSchema, type CalloutData, type CalloutVariant } from "@scaffold/contracts";
import { NodeViewContent, type NodeViewProps } from "@tiptap/react";
import type { ReactNode } from "react";

import { IconRenderer } from "@/ui/icons/IconRenderer";
import { cn } from "@/lib/cn";
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

function calloutIconChipClassName(interactive: boolean): string {
  return cn("sc-callout__icon-chip", interactive && "sc-callout__icon-chip--interactive");
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
    <span className={calloutIconChipClassName(false)} aria-hidden>
      <IconRenderer value={data.icon} fallbackValue={fallbackValue} className="sc-callout__icon" />
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
  const isAlert = !editable && (data.variant === "warning" || data.variant === "error");
  const icon: ReactNode =
    editable && data.showIcon && renderIconControl ? (
      renderIconControl({
        className: calloutIconChipClassName(true),
        fallbackValue: calloutVariantIcons[data.variant],
        value: data.icon,
        onValueChange: (icon) => updateData({ icon }),
      })
    ) : (
      <StaticCalloutIcon data={data} />
    );

  return (
    <aside
      role={isAlert ? "alert" : "note"}
      aria-label={title ? `${label}: ${title}` : `${label} callout`}
      className={cn("sc-callout", `sc-callout--${data.variant}`)}
    >
      <div className="sc-callout__layout">
        {icon}
        <div className="sc-callout__content">
          <NodeViewContent />
        </div>
      </div>
    </aside>
  );
}
