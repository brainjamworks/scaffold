export interface CourseTypeTokens {
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  letterSpacing: string;
}

export interface CourseHeadingTypeTokens extends CourseTypeTokens {
  textTransform: string;
}

export interface CourseFunctionalTokens {
  color: {
    background: {
      canvas: string;
      page: string;
      surface: string;
      surfaceMuted: string;
      inverse: string;
    };
    text: {
      primary: string;
      heading: string;
      secondary: string;
      muted: string;
      placeholder: string;
      inverse: string;
      link: string;
    };
    border: { default: string; subtle: string; strong: string };
    action: {
      primary: {
        background: { rest: string; hover: string; pressed: string; muted: string };
        foreground: string;
      };
      secondary: {
        background: { rest: string; hover: string };
        foreground: string;
      };
      quiet: { foreground: string; background: { hover: string } };
      disabled: { background: string; foreground: string };
    };
    focus: { outline: string; ring: string };
    feedback: {
      info: CourseFeedbackColorTokens;
      success: CourseFeedbackColorTokens;
      warning: CourseFeedbackColorTokens;
      error: CourseFeedbackColorTokens;
      correct: CourseFeedbackColorTokens;
      incorrect: CourseFeedbackColorTokens;
    };
    navigation: {
      current: string;
      completed: string;
      available: string;
      locked: string;
    };
    overlay: {
      backdrop: string;
      surface: string;
      control: { background: { rest: string; hover: string }; foreground: string };
    };
  };
  type: {
    display: CourseHeadingTypeTokens;
    title: CourseHeadingTypeTokens;
    headingLarge: CourseHeadingTypeTokens;
    headingMedium: CourseHeadingTypeTokens;
    headingSmall: CourseHeadingTypeTokens;
    bodyLarge: CourseTypeTokens;
    body: CourseTypeTokens;
    bodySmall: CourseTypeTokens;
    label: CourseTypeTokens;
    caption: CourseTypeTokens;
    code: CourseTypeTokens;
  };
  space: {
    inlineCompact: string;
    inlineControl: string;
    blockControl: string;
    contentGap: string;
    blockGap: string;
    sectionGap: string;
    surfaceInline: string;
    surfaceBlock: string;
  };
  size: {
    touchTarget: { minimum: string };
    control: { small: string; medium: string; large: string };
    icon: { small: string; medium: string; large: string };
    content: { reading: string; wide: string };
  };
  radius: { control: string; content: string; surface: string; overlay: string; pill: string };
  border: { width: { default: string; strong: string } };
  elevation: { flat: string; raised: string; floating: string; overlay: string };
  motion: {
    duration: { instant: string; fast: string; standard: string; deliberate: string };
    easing: { standard: string; enter: string; exit: string; emphasized: string };
  };
}

export interface CourseFeedbackColorTokens {
  background: string;
  foreground: string;
  accent: string;
}

export interface CourseComponentTokenAliases {
  button: {
    primary: {
      background: {
        rest: CourseFunctionalTokenPath;
        hover: CourseFunctionalTokenPath;
        pressed: CourseFunctionalTokenPath;
      };
      foreground: CourseFunctionalTokenPath;
      radius: CourseFunctionalTokenPath;
    };
    medium: { height: CourseFunctionalTokenPath; paddingInline: CourseFunctionalTokenPath };
    label: { type: CourseFunctionalTokenPath };
  };
  iconButton: {
    quiet: {
      background: { hover: CourseFunctionalTokenPath };
      foreground: { rest: CourseFunctionalTokenPath };
    };
    medium: { size: CourseFunctionalTokenPath };
  };
  choice: {
    background: {
      rest: CourseFunctionalTokenPath;
      hover: CourseFunctionalTokenPath;
      selected: CourseFunctionalTokenPath;
    };
    correct: { background: CourseFunctionalTokenPath };
    incorrect: { background: CourseFunctionalTokenPath };
  };
  feedback: {
    correct: { background: CourseFunctionalTokenPath; foreground: CourseFunctionalTokenPath };
    incorrect: { background: CourseFunctionalTokenPath; foreground: CourseFunctionalTokenPath };
  };
  navigation: {
    position: {
      current: CourseFunctionalTokenPath;
      completed: CourseFunctionalTokenPath;
      locked: CourseFunctionalTokenPath;
    };
  };
  progress: {
    track: { background: CourseFunctionalTokenPath };
    indicator: { background: CourseFunctionalTokenPath };
  };
}

export type CourseFunctionalTokenPath = TokenPaths<CourseFunctionalTokens>;

export interface ResolvedCourseComponentTokens {
  button: {
    primary: {
      background: { rest: string; hover: string; pressed: string };
      foreground: string;
      radius: string;
    };
    medium: { height: string; paddingInline: string };
    label: { type: CourseTypeTokens };
  };
  iconButton: {
    quiet: { background: { hover: string }; foreground: { rest: string } };
    medium: { size: string };
  };
  choice: {
    background: { rest: string; hover: string; selected: string };
    correct: { background: string };
    incorrect: { background: string };
  };
  feedback: {
    correct: { background: string; foreground: string };
    incorrect: { background: string; foreground: string };
  };
  navigation: { position: { current: string; completed: string; locked: string } };
  progress: { track: { background: string }; indicator: { background: string } };
}

export interface ResolvedCourseUiTokens {
  functional: CourseFunctionalTokens;
  component: ResolvedCourseComponentTokens;
}

export type ScCourseCssProperty = `--sc-course-${string}`;
export type ScCourseCssProperties = Readonly<Record<ScCourseCssProperty, string>>;

type TokenPaths<T> = {
  [Key in keyof T & string]: T[Key] extends object ? Key | `${Key}.${TokenPaths<T[Key]>}` : Key;
}[keyof T & string];
