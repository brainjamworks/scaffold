/**
 * Shared types for assessment atoms (presentation layer).
 * No Tiptap or PM imports.
 */

export type ChoiceState = "correct" | "incorrect" | "missed" | null;
export type FeedbackVariant = "correct" | "incorrect" | "partial";
export type FeedbackMode = "immediate" | "on_submit";
