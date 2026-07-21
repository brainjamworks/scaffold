/**
 * Scaffold chart-theme contract.
 *
 * ECharts 6's public theming surface is `registerTheme(name, theme)` +
 * `init(dom, name)` + `instance.setTheme(name)`. There is no public token
 * API (RFC apache/echarts#20202 was closed unmerged in Oct 2025). The
 * "design tokens" reference in the v6 release notes is an internal
 * refactor only.
 *
 * This module is therefore our token layer: a typed `ChartTokens`
 * interface read from CSS custom properties, fed into a single
 * `buildChartTheme` that produces the ThemeOption registered as
 * `'scaffold'`. Per-series defaults (bar radius, line/scatter symbol,
 * pie border + emphasis) live here so profiles only express
 * encoding-driven options.
 */
export interface ChartTokens {
  // Colour
  ink: string;
  muted: string;
  border: string;
  borderSubtle: string;
  background: string;
  axisPointerWash: string;
  tooltipShadow: string;

  // Typography
  sans: string;
  mono: string;

  // Series palette — categorical-encoding ramp. Triple-in-reserve
  // anchors slots 1-3 (navy / coral / teal); rules about chrome don't
  // apply to data-viz categorical encoding.
  palette: readonly string[];

  // Geometry
  radiusBar: number;
  radiusTooltip: number;
  radiusPie: number;

  // Series behaviour
  symbolSize: number;
  lineWidth: number;
  emphasisScaleLine: number;
  emphasisScaleSize: number;
}

const DEFAULT_TOKENS: ChartTokens = {
  ink: "#18181b",
  muted: "#71717a",
  border: "#e4e4e7",
  borderSubtle: "#f4f4f5",
  background: "#ffffff",
  axisPointerWash: "rgba(33, 43, 88, 0.06)",
  tooltipShadow: "0 8px 24px -4px rgb(0 0 0 / 0.12), 0 2px 6px -2px rgb(0 0 0 / 0.08)",
  sans: "Poppins, ui-sans-serif, system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
  palette: ["#161D77", "#F43A57", "#00BA92", "#5b6790", "#f47398", "#33bda5", "#52525b", "#a1a1aa"],
  radiusBar: 6,
  radiusTooltip: 12,
  radiusPie: 6,
  symbolSize: 8,
  lineWidth: 2.5,
  emphasisScaleLine: 1.3,
  emphasisScaleSize: 6,
};

export function readChartTokens(scope: Element | null): ChartTokens {
  if (!scope || typeof getComputedStyle !== "function") return DEFAULT_TOKENS;
  const style = getComputedStyle(scope);
  const read = (name: string, fallback: string) => {
    const value = style.getPropertyValue(name).trim();
    return value || fallback;
  };
  return {
    ...DEFAULT_TOKENS,
    ink: read("--color-ink", DEFAULT_TOKENS.ink),
    muted: read("--color-text-muted", DEFAULT_TOKENS.muted),
    border: read("--color-border", DEFAULT_TOKENS.border),
    borderSubtle: read("--color-border-subtle", DEFAULT_TOKENS.borderSubtle),
    background: read("--color-background", DEFAULT_TOKENS.background),
    sans: read("--font-sans", DEFAULT_TOKENS.sans),
    mono: read("--font-mono", DEFAULT_TOKENS.mono),
  };
}

export function buildChartTheme(tokens: ChartTokens): Record<string, unknown> {
  const {
    ink,
    muted,
    border,
    borderSubtle,
    background,
    axisPointerWash,
    tooltipShadow,
    sans,
    mono,
    palette,
    radiusBar,
    radiusTooltip,
    radiusPie,
    symbolSize,
    lineWidth,
    emphasisScaleLine,
    emphasisScaleSize,
  } = tokens;

  const axisShared = {
    axisLabel: { color: muted, fontFamily: mono, fontSize: 11 },
    axisLine: { show: false, lineStyle: { color: border } },
    axisTick: { show: false, lineStyle: { color: border } },
    nameLocation: "middle" as const,
    nameTextStyle: {
      color: muted,
      fontFamily: sans,
      fontSize: 11,
      fontWeight: 600,
    },
    splitLine: { lineStyle: { color: borderSubtle, type: "dashed" as const } },
  };

  return {
    color: [...palette],
    backgroundColor: "transparent",
    textStyle: { color: ink, fontFamily: sans, fontSize: 13 },
    title: {
      left: "center",
      textStyle: {
        color: ink,
        fontFamily: sans,
        fontSize: 17,
        fontWeight: 700,
      },
      subtextStyle: {
        color: muted,
        fontFamily: sans,
        fontSize: 12,
        fontWeight: 500,
      },
    },
    legend: {
      icon: "roundRect" as const,
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 16,
      textStyle: {
        color: muted,
        fontFamily: sans,
        fontSize: 12,
        fontWeight: 500,
      },
    },
    tooltip: {
      backgroundColor: background,
      borderColor: border,
      borderWidth: 1,
      padding: 12,
      textStyle: { color: ink, fontFamily: sans, fontSize: 12 },
      extraCssText: [
        `border-radius: ${radiusTooltip}px`,
        `box-shadow: ${tooltipShadow}`,
        "font-variant-numeric: tabular-nums",
      ].join("; "),
      axisPointer: {
        type: "shadow" as const,
        shadowStyle: { color: axisPointerWash },
      },
    },
    categoryAxis: {
      ...axisShared,
      axisLine: { show: true, lineStyle: { color: border } },
      splitLine: { show: false },
      nameGap: 30,
    },
    valueAxis: { ...axisShared, nameGap: 42 },
    bar: {
      barMaxWidth: 48,
      barCategoryGap: "30%",
      itemStyle: { borderRadius: [radiusBar, radiusBar, 0, 0] },
      emphasis: { focus: "series" as const },
    },
    line: {
      lineStyle: { width: lineWidth },
      symbol: "circle",
      symbolSize,
      showSymbol: true,
      emphasis: {
        focus: "series" as const,
        lineStyle: { width: lineWidth + 0.5 },
        scale: emphasisScaleLine,
      },
    },
    scatter: {
      symbolSize: symbolSize + 2,
      emphasis: { focus: "self" as const, scale: true, scaleSize: 4 },
    },
    pie: {
      itemStyle: {
        borderColor: background,
        borderRadius: radiusPie,
        borderWidth: 3,
      },
      label: { fontFamily: sans, fontSize: 12, color: ink },
      emphasis: {
        focus: "self" as const,
        scale: true,
        scaleSize: emphasisScaleSize,
      },
    },
    heatmap: {
      itemStyle: { borderColor: background, borderWidth: 1 },
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowColor: "rgba(0, 0, 0, 0.2)",
        },
      },
    },
    // VisualMap drives heatmap cell colour and isn't covered by the
    // series palette. Use a sequential ramp that resolves to the
    // chart background at zero and the brand primary at max — reads
    // as "more = more brand", and shares the surface colour so
    // empty-ish cells fade into the canvas instead of looking flat blue.
    visualMap: {
      itemWidth: 12,
      itemHeight: 96,
      // Numbers on the visualMap are tabular values, not labels —
      // use mono so the digits align across hover and resize.
      textStyle: { color: muted, fontFamily: mono, fontSize: 11 },
      inRange: { color: [background, palette[0]] },
      handleStyle: { color: palette[0], borderColor: background },
      indicatorStyle: { color: palette[0] },
    },
    // DataZoom defaults render with echarts' pale blue chrome. Bring
    // them into the brand: muted surface for the inactive rail, ink
    // for the moved range, primary for the handles. Keeps the slider
    // legible as a control without competing with the plot.
    dataZoom: [
      {
        type: "slider",
        backgroundColor: "transparent",
        borderColor: borderSubtle,
        fillerColor: `${palette[0]}14`,
        handleStyle: {
          color: background,
          borderColor: palette[0],
          borderWidth: 1.5,
        },
        moveHandleStyle: { color: palette[0] },
        emphasis: {
          handleStyle: { color: palette[0], borderColor: palette[0] },
          moveHandleStyle: { color: palette[0] },
        },
        dataBackground: {
          lineStyle: { color: border, width: 1 },
          areaStyle: { color: borderSubtle, opacity: 1 },
        },
        selectedDataBackground: {
          lineStyle: { color: palette[0], width: 1 },
          areaStyle: { color: `${palette[0]}1a` },
        },
        textStyle: { color: muted, fontFamily: mono, fontSize: 10 },
      },
      { type: "inside" },
    ],
  };
}

export const SCAFFOLD_CHART_THEME_NAME = "scaffold";
