/**
 * Scaffold chart-theme contract.
 *
 * This module is our renderer-neutral token layer: a typed `ChartTokens`
 * interface read from the chart's course scope and fed into
 * `buildChartTheme`. The resulting object is passed directly to each
 * ECharts instance so separate course scopes never share global theme
 * state. Per-series defaults live here so profiles only express
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
  heading: string;
  fontSizeAxis: number;
  fontSizeCompact: number;
  fontSizeSupporting: number;
  fontSizeBody: number;
  fontSizeTitle: number;

  // Series palette — supplied by the selected Course colour system.
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

export const CHART_BODY_FONT_ROLE = "__sc_course_chart_body_font__";
export const CHART_INK_COLOUR_ROLE = "__sc_course_chart_ink__";
export const CHART_MUTED_COLOUR_ROLE = "__sc_course_chart_muted__";
export const CHART_BACKGROUND_COLOUR_ROLE = "__sc_course_chart_background__";
export const CHART_BAR_RADIUS_ROLE = "__sc_course_chart_bar_radius__";

export function readChartTokens(scope: Element): ChartTokens {
  const style = getComputedStyle(scope);
  const read = (name: string): string => {
    const value = style.getPropertyValue(name).trim();
    if (!value) throw new Error(`Missing Course Chart token: ${name}`);
    return value;
  };
  const readNumber = (name: string): number => {
    const value = Number(read(name));
    if (!Number.isFinite(value)) throw new Error(`Invalid Course Chart number: ${name}`);
    return value;
  };
  const palette = Array.from({ length: 8 }, (_, index) =>
    read(`--sc-course-data-series-${index + 1}`),
  );
  return {
    ink: read("--gray-12"),
    muted: read("--gray-11"),
    border: read("--gray-a6"),
    borderSubtle: read("--gray-a4"),
    background: read("--color-panel-solid"),
    axisPointerWash: read("--accent-a3"),
    tooltipShadow: read("--shadow-4"),
    sans: read("--default-font-family"),
    heading: read("--heading-font-family"),
    fontSizeAxis: readNumber("--sc-course-chart-axis-font-size"),
    fontSizeCompact: readNumber("--sc-course-chart-compact-font-size"),
    fontSizeSupporting: readNumber("--sc-course-chart-supporting-font-size"),
    fontSizeBody: readNumber("--sc-course-chart-body-font-size"),
    fontSizeTitle: readNumber("--sc-course-chart-title-font-size"),
    palette,
    radiusBar: readNumber("--sc-course-chart-bar-radius"),
    radiusTooltip: readNumber("--sc-course-chart-tooltip-radius"),
    radiusPie: readNumber("--sc-course-chart-pie-radius"),
    symbolSize: readNumber("--sc-course-chart-symbol-size"),
    lineWidth: readNumber("--sc-course-chart-line-width"),
    emphasisScaleLine: readNumber("--sc-course-chart-line-emphasis-scale"),
    emphasisScaleSize: readNumber("--sc-course-chart-series-emphasis-size"),
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
    heading,
    fontSizeAxis,
    fontSizeCompact,
    fontSizeSupporting,
    fontSizeBody,
    fontSizeTitle,
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
    axisLabel: { color: muted, fontFamily: sans, fontSize: fontSizeAxis },
    axisLine: { show: false, lineStyle: { color: border } },
    axisTick: { show: false, lineStyle: { color: border } },
    nameLocation: "middle" as const,
    nameTextStyle: {
      color: muted,
      fontFamily: sans,
      fontSize: fontSizeAxis,
      fontWeight: 600,
    },
    splitLine: { lineStyle: { color: borderSubtle, type: "dashed" as const } },
  };

  return {
    color: [...palette],
    backgroundColor: "transparent",
    textStyle: { color: ink, fontFamily: sans, fontSize: fontSizeBody },
    title: {
      left: "center",
      textStyle: {
        color: ink,
        fontFamily: heading,
        fontSize: fontSizeTitle,
        fontWeight: 700,
      },
      subtextStyle: {
        color: muted,
        fontFamily: sans,
        fontSize: fontSizeSupporting,
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
        fontSize: fontSizeSupporting,
        fontWeight: 500,
      },
    },
    tooltip: {
      backgroundColor: background,
      borderColor: border,
      borderWidth: 1,
      padding: 12,
      textStyle: { color: ink, fontFamily: sans, fontSize: fontSizeSupporting },
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
      label: { fontFamily: sans, fontSize: fontSizeSupporting, color: ink },
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
      textStyle: { color: muted, fontFamily: sans, fontSize: fontSizeAxis },
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
        textStyle: { color: muted, fontFamily: sans, fontSize: fontSizeCompact },
      },
      { type: "inside" },
    ],
  };
}
