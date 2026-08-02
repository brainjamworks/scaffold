import { deepFreeze, type CourseThemePresetRevision } from "../../course-theme-preset";
import type { CourseFeedbackColorTokens, CourseFunctionalTokens } from "../../course-ui-tokens";

const SATOSHI = '"Satoshi", sans-serif';
const JETBRAINS_MONO = '"JetBrains Mono Variable", monospace';

const LIGHT = {
  canvas: "#F7F7F8",
  page: "#FFFFFF",
  surface: "#FFFFFF",
  surfaceMuted: "#F0F0F2",
  inverse: "#111113",
  text: "#18181B",
  heading: "#111113",
  textSecondary: "#4F4F58",
  textMuted: "#686873",
  placeholder: "#71717A",
  textInverse: "#FFFFFF",
  link: "#303A8F",
  border: "#D8D8DE",
  borderSubtle: "#E9E9ED",
  borderStrong: "#A0A0AA",
  primary: "#303A8F",
  onPrimary: "#FFFFFF",
  primaryHover: "#262F7B",
  primaryPressed: "#1D2567",
  primaryMuted: "#ECEEFA",
  secondaryBackground: "#FFFFFF",
  secondaryForeground: "#30313A",
  secondaryHover: "#F1F1F3",
  quietForeground: "#30313A",
  quietHover: "#F1F1F3",
  disabledBackground: "#E9E9ED",
  disabledForeground: "#65656F",
  focusOutline: "#4C5BD4",
  focusRing: "rgb(76 91 212 / 0.28)",
  navigationCompleted: "#087A5B",
  navigationAvailable: "#686873",
  navigationLocked: "#A0A0AA",
  overlayBackdrop: "rgb(10 10 12 / 0.48)",
  overlaySurface: "#FFFFFF",
  overlayControl: "#18181B",
  overlayControlHover: "#30313A",
  overlayControlForeground: "#FFFFFF",
  info: feedback("#ECF1FF", "#203E89", "#3157B7"),
  success: feedback("#E6F6F0", "#075E48", "#087A5B"),
  warning: feedback("#FFF4D6", "#754200", "#965400"),
  error: feedback("#FDE8EC", "#8E1D34", "#C62F4B"),
} as const;

const DARK = {
  canvas: "#0A0A0C",
  page: "#111113",
  surface: "#1A1A1E",
  surfaceMuted: "#242429",
  inverse: "#F7F7F8",
  text: "#F7F7F8",
  heading: "#FFFFFF",
  textSecondary: "#C7C7CE",
  textMuted: "#A0A0AA",
  placeholder: "#858590",
  textInverse: "#111113",
  link: "#BEC3FF",
  border: "#414149",
  borderSubtle: "#2C2C32",
  borderStrong: "#5A5A64",
  primary: "#AEB5FF",
  onPrimary: "#16182A",
  primaryHover: "#C1C6FF",
  primaryPressed: "#959DEB",
  primaryMuted: "#2C315D",
  secondaryBackground: "#242429",
  secondaryForeground: "#F7F7F8",
  secondaryHover: "#303037",
  quietForeground: "#E4E4E8",
  quietHover: "#2A2A30",
  disabledBackground: "#2B2B31",
  disabledForeground: "#92929C",
  focusOutline: "#AEB5FF",
  focusRing: "rgb(174 181 255 / 0.32)",
  navigationCompleted: "#5BDBB5",
  navigationAvailable: "#A0A0AA",
  navigationLocked: "#5A5A64",
  overlayBackdrop: "rgb(0 0 0 / 0.68)",
  overlaySurface: "#202025",
  overlayControl: "#F7F7F8",
  overlayControlHover: "#E4E4E8",
  overlayControlForeground: "#111113",
  info: feedback("#1D2748", "#D8E0FF", "#9BB0FF"),
  success: feedback("#12352D", "#B7F3E0", "#5BDBB5"),
  warning: feedback("#3B2C12", "#FFE1A3", "#F7C76C"),
  error: feedback("#451A23", "#FFC4CE", "#FF8CA0"),
} as const;

export const SCAFFOLD_FLOW_V1 = deepFreeze({
  id: "scaffold-flow",
  revision: "1",
  label: "Scaffold Flow",
  description: "A calm, focused course presentation built around clear learning moments.",
  authorDefaults: {
    colors: {
      light: {
        background: "#FFFFFF",
        surface: "#FFFFFF",
        bodyText: "#18181B",
        headingText: "#111113",
        primary: "#303A8F",
        secondary: "#5A62B4",
        accent1: "#087F66",
        accent2: "#A15C00",
        accent3: "#0E7490",
        accent4: "#B4236A",
        link: "#303A8F",
      },
      dark: {
        background: "#111113",
        surface: "#1A1A1E",
        bodyText: "#F7F7F8",
        headingText: "#FFFFFF",
        primary: "#AEB5FF",
        secondary: "#C8CBFF",
        accent1: "#5ADBB8",
        accent2: "#F7C76C",
        accent3: "#67E8F9",
        accent4: "#F9A8D4",
        link: "#BEC3FF",
      },
    },
    typography: {
      headingFontId: "scaffold-satoshi",
      bodyFontId: "scaffold-satoshi",
      codeFontId: "scaffold-jetbrains-mono",
      headingWeight: 600,
      bodyWeight: 400,
      typeScale: 1,
      bodyLineHeight: 1.6,
      headingLineHeight: 1.2,
      headingLetterSpacing: -0.015,
      uppercaseHeadings: false,
    },
    design: {
      roundness: 0.67,
      stroke: 1,
      shadow: "soft",
      density: "comfortable",
    },
  },
  functional: {
    light: createFunctionalTokens(LIGHT),
    dark: createFunctionalTokens(DARK),
  },
  componentAliases: {
    button: {
      primary: {
        background: {
          rest: "color.action.primary.background.rest",
          hover: "color.action.primary.background.hover",
          pressed: "color.action.primary.background.pressed",
        },
        foreground: "color.action.primary.foreground",
        radius: "radius.control",
      },
      medium: { height: "size.control.medium", paddingInline: "space.inlineControl" },
      label: { type: "type.label" },
    },
    iconButton: {
      quiet: {
        background: { hover: "color.action.quiet.background.hover" },
        foreground: { rest: "color.action.quiet.foreground" },
      },
      medium: { size: "size.control.medium" },
    },
    choice: {
      background: {
        rest: "color.background.surface",
        hover: "color.action.quiet.background.hover",
        selected: "color.action.primary.background.muted",
      },
      correct: { background: "color.feedback.correct.background" },
      incorrect: { background: "color.feedback.incorrect.background" },
    },
    feedback: {
      correct: {
        background: "color.feedback.correct.background",
        foreground: "color.feedback.correct.foreground",
      },
      incorrect: {
        background: "color.feedback.incorrect.background",
        foreground: "color.feedback.incorrect.foreground",
      },
    },
    navigation: {
      position: {
        current: "color.navigation.current",
        completed: "color.navigation.completed",
        locked: "color.navigation.locked",
      },
    },
    progress: {
      track: { background: "color.background.surfaceMuted" },
      indicator: { background: "color.navigation.current" },
    },
  },
} satisfies CourseThemePresetRevision);

type Palette = typeof LIGHT | typeof DARK;

function createFunctionalTokens(palette: Palette): CourseFunctionalTokens {
  return {
    color: {
      background: {
        canvas: palette.canvas,
        page: palette.page,
        surface: palette.surface,
        surfaceMuted: palette.surfaceMuted,
        inverse: palette.inverse,
      },
      text: {
        primary: palette.text,
        heading: palette.heading,
        secondary: palette.textSecondary,
        muted: palette.textMuted,
        placeholder: palette.placeholder,
        inverse: palette.textInverse,
        link: palette.link,
      },
      border: {
        default: palette.border,
        subtle: palette.borderSubtle,
        strong: palette.borderStrong,
      },
      action: {
        primary: {
          background: {
            rest: palette.primary,
            hover: palette.primaryHover,
            pressed: palette.primaryPressed,
            muted: palette.primaryMuted,
          },
          foreground: palette.onPrimary,
        },
        secondary: {
          background: { rest: palette.secondaryBackground, hover: palette.secondaryHover },
          foreground: palette.secondaryForeground,
        },
        quiet: { foreground: palette.quietForeground, background: { hover: palette.quietHover } },
        disabled: {
          background: palette.disabledBackground,
          foreground: palette.disabledForeground,
        },
      },
      focus: { outline: palette.focusOutline, ring: palette.focusRing },
      feedback: {
        info: palette.info,
        success: palette.success,
        warning: palette.warning,
        error: palette.error,
        correct: palette.success,
        incorrect: palette.error,
      },
      navigation: {
        current: palette.primary,
        completed: palette.navigationCompleted,
        available: palette.navigationAvailable,
        locked: palette.navigationLocked,
      },
      overlay: {
        backdrop: palette.overlayBackdrop,
        surface: palette.overlaySurface,
        control: {
          background: { rest: palette.overlayControl, hover: palette.overlayControlHover },
          foreground: palette.overlayControlForeground,
        },
      },
    },
    type: {
      display: headingType("clamp(2.75rem, 2.25rem + 2vw, 4rem)", "1", "-0.035em"),
      title: headingType("clamp(2.125rem, 1.875rem + 1vw, 3rem)", "1.08", "-0.025em"),
      headingLarge: headingType("clamp(1.75rem, 1.625rem + 0.5vw, 2.25rem)", "1.15", "-0.02em"),
      headingMedium: headingType("clamp(1.375rem, 1.25rem + 0.4vw, 1.75rem)", "1.2", "-0.015em"),
      headingSmall: headingType("1.25rem", "1.3", "-0.01em"),
      bodyLarge: bodyType("clamp(1.0625rem, 1.03rem + 0.15vw, 1.1875rem)", "1.65"),
      body: bodyType("clamp(1rem, 0.98rem + 0.1vw, 1.0625rem)", "1.6"),
      bodySmall: bodyType("clamp(0.875rem, 0.85rem + 0.1vw, 0.9375rem)", "1.55"),
      label: bodyType("0.875rem", "1.35", "500", "0.005em"),
      caption: bodyType("0.75rem", "1.4", "500", "0.015em"),
      code: {
        fontFamily: JETBRAINS_MONO,
        fontSize: "0.875rem",
        fontWeight: "400",
        lineHeight: "1.55",
        letterSpacing: "0",
      },
    },
    space: {
      inlineCompact: "0.5rem",
      inlineControl: "1rem",
      blockControl: "0.75rem",
      contentGap: "1.5rem",
      blockGap: "2rem",
      sectionGap: "clamp(3.5rem, 2.5rem + 3vw, 5rem)",
      surfaceInline: "clamp(1.25rem, 0.75rem + 2vw, 4rem)",
      surfaceBlock: "clamp(2rem, 1.25rem + 3vw, 5rem)",
    },
    size: {
      touchTarget: { minimum: "44px" },
      control: { small: "36px", medium: "44px", large: "52px" },
      icon: { small: "16px", medium: "20px", large: "24px" },
      content: { reading: "68ch", wide: "90rem" },
    },
    radius: { control: "12px", content: "14px", surface: "20px", overlay: "24px", pill: "9999px" },
    border: { width: { default: "1px", strong: "2px" } },
    elevation: {
      flat: "none",
      raised: "0 1px 2px rgb(10 10 12 / 0.08)",
      floating: "0 8px 24px -8px rgb(10 10 12 / 0.18), 0 2px 8px -2px rgb(10 10 12 / 0.08)",
      overlay: "0 24px 64px -20px rgb(10 10 12 / 0.28), 0 8px 24px -8px rgb(10 10 12 / 0.16)",
    },
    motion: {
      duration: { instant: "0ms", fast: "120ms", standard: "180ms", deliberate: "280ms" },
      easing: {
        standard: "cubic-bezier(0.2, 0, 0, 1)",
        enter: "cubic-bezier(0.16, 1, 0.3, 1)",
        exit: "cubic-bezier(0.4, 0, 1, 1)",
        emphasized: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      },
    },
  };
}

function feedback(
  background: string,
  foreground: string,
  accent: string,
): CourseFeedbackColorTokens {
  return { background, foreground, accent };
}

function headingType(fontSize: string, lineHeight: string, letterSpacing: string) {
  return {
    fontFamily: SATOSHI,
    fontSize,
    fontWeight: "600",
    lineHeight,
    letterSpacing,
    textTransform: "none",
  };
}

function bodyType(fontSize: string, lineHeight: string, fontWeight = "400", letterSpacing = "0") {
  return { fontFamily: SATOSHI, fontSize, fontWeight, lineHeight, letterSpacing };
}
