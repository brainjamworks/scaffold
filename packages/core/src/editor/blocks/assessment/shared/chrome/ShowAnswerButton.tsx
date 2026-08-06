import { AssessmentSupportButton } from "@/ui/components/course/AssessmentSupportButton/AssessmentSupportButton";
import { AssessmentSupportStatus } from "@/ui/components/course/AssessmentSupportStatus/AssessmentSupportStatus";

interface ShowAnswerButtonProps {
  revealed: boolean;
  onClick: () => void;
}

/** Keeps answer reveal feature state independent inside the support zone. */
export function ShowAnswerButton({ revealed, onClick }: ShowAnswerButtonProps) {
  if (revealed) {
    return <AssessmentSupportStatus status="answer-revealed" />;
  }

  return (
    <AssessmentSupportButton intent="answer" aria-label="Show correct answer" onClick={onClick}>
      Show answer
    </AssessmentSupportButton>
  );
}
