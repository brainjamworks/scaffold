import type { NodeViewProps } from "@tiptap/react";

import { ChartBlockAttrsSchema } from "@/schemas/shared";

import { Chart } from "./Chart";

import "./chart.css";

export function ChartBody(props: NodeViewProps) {
  const parsed = ChartBlockAttrsSchema.safeParse(props.node.attrs);
  const chart = parsed.success && parsed.data.data ? parsed.data.data : null;
  return <Chart chart={chart} showCaption />;
}
