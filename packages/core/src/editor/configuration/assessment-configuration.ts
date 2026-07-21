import {
  CheckSquareIcon as CheckSquare,
  EyeIcon as Eye,
  LightningIcon as Lightning,
  PaperPlaneTiltIcon as PaperPlaneTilt,
} from "@phosphor-icons/react";
import type { ZodTypeAny } from "zod";

import {
  defineConfiguration,
  type ConfigurationDefinition,
  type ConfigurationControlDescriptor,
  type ConfigurationSheetSection,
} from "./definition";

const ASSESSMENT_BEHAVIOUR_SECTION: ConfigurationSheetSection = {
  id: "behaviour",
  title: "Behaviour",
  description: "Set when learners get feedback and how this question counts.",
};

export interface AssessmentConfigurationOptions {
  schema: ZodTypeAny;
  title: string;
  description?: string;
  defaultOpenSections?: readonly string[];
  sections?: readonly ConfigurationSheetSection[];
  controls?: readonly ConfigurationControlDescriptor[];
}

export function createAssessmentConfiguration(
  options: AssessmentConfigurationOptions,
): ConfigurationDefinition {
  return defineConfiguration({
    attr: "settings",
    schema: options.schema,
    sheet: {
      title: options.title,
      description:
        options.description ?? "Control grading, feedback, and answer review for this question.",
      defaultOpenSections: options.defaultOpenSections ?? ["behaviour"],
      sections: [ASSESSMENT_BEHAVIOUR_SECTION, ...(options.sections ?? [])],
    },
    controls: [...createAssessmentConfigurationControls(), ...(options.controls ?? [])],
  });
}

export function createAssessmentConfigurationControls(): ConfigurationControlDescriptor[] {
  return [
    {
      kind: "select",
      name: "feedbackMode",
      label: "Feedback mode",
      description:
        "Choose whether learners see feedback while they answer or only after they submit.",
      options: [
        { value: "on_submit", label: "On submit", icon: PaperPlaneTilt },
        { value: "immediate", label: "Immediate", icon: Lightning },
      ],
      placement: {
        quickMenu: { presentation: "segmented" },
        sheet: { section: "behaviour" },
      },
    },
    {
      kind: "boolean",
      name: "isGraded",
      label: "Graded",
      description: "Include this question in scoring and reported results.",
      icon: CheckSquare,
      placement: {
        quickMenu: { presentation: "icon-toggle" },
        sheet: { section: "behaviour" },
      },
    },
    {
      kind: "boolean",
      name: "showAnswer",
      label: "Show answer",
      description: "Allow learners to reveal the correct answer when this question permits review.",
      icon: Eye,
      placement: {
        quickMenu: { presentation: "icon-toggle" },
        sheet: { section: "behaviour" },
      },
    },
  ];
}
