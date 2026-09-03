import { AssessmentSupportButton } from "@/ui/components/course/AssessmentSupportButton/AssessmentSupportButton";

interface ShowAnswerButtonProps {
  pressed: boolean;
  onClick: () => void;
}

/** Keeps answer reveal feature state independent inside the support zone. */
export function ShowAnswerButton({ pressed, onClick }: ShowAnswerButtonProps) {
  return (
    <AssessmentSupportButton
      intent="answer"
      aria-label="Show answer"
      aria-pressed={pressed}
      onClick={onClick}
    >
      {pressed ? "Answer revealed" : "Show answer"}
    </AssessmentSupportButton>
  );
}
