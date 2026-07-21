import { Button } from "@/ui/components/Button/Button";

import "./assessment-controls.css";

interface ShowAnswerButtonProps {
  revealed: boolean;
  onClick: () => void;
}

/**
 * Secondary (outlined) pill — "Show answer" until clicked, then
 * "Answer revealed" and disabled. Sits beside Submit / Try-again as the
 * low-emphasis escape hatch for stuck learners. Text-only chrome by
 * design — the action speaks for itself; an icon on a low-emphasis
 * escape hatch adds visual weight the gesture doesn't warrant.
 */
export function ShowAnswerButton({ revealed, onClick }: ShowAnswerButtonProps) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="md"
      className="sc-assessment-show-answer-button"
      disabled={revealed}
      aria-label={revealed ? "Correct answer revealed" : "Show correct answer"}
      onClick={onClick}
    >
      {revealed ? "Answer revealed" : "Show answer"}
    </Button>
  );
}
