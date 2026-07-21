// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import { Hints } from "./Hints";

describe("Hints", () => {
  it("hides runtime hint affordances after submission", () => {
    const onReveal = vi.fn();

    render(
      <Hints
        hintsShown={0}
        hintsTotal={1}
        isEditable={false}
        submitted
        onReveal={onReveal}
        onAddHint={vi.fn()}
      >
        <p>Hint body</p>
      </Hints>,
    );

    expect(screen.queryByRole("button", { name: "Show a hint" })).toBeNull();
    expect(screen.queryByText("Hint body")).toBeNull();
    expect(onReveal).not.toHaveBeenCalled();
  });

  it("shows revealed hint content and paging actions in an accessible dialog", () => {
    render(
      <Hints
        hintsShown={1}
        hintsTotal={2}
        isEditable={false}
        submitted={false}
        onReveal={vi.fn()}
        onAddHint={vi.fn()}
      >
        <p>Try the smallest option first.</p>
      </Hints>,
    );

    expect(screen.queryByText("Try the smallest option first.")).toBeNull();
    expect(screen.queryByLabelText("Hint navigation")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show next hint" }));

    const dialog = screen.getByRole("dialog", { name: "Hint 1 of 2" });
    expect(within(dialog).getByRole("heading", { name: "Hint 1", level: 2 })).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Hint navigation")).toBeInTheDocument();
    expect(
      (within(dialog).getByRole("button", { name: "Previous hint" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (within(dialog).getByRole("button", { name: "Next hint" }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(within(dialog).getByText("Try the smallest option first.")).toBeInstanceOf(HTMLElement);
  });

  it("hides already revealed hint popovers after submission", () => {
    const onReveal = vi.fn();

    render(
      <Hints
        hintsShown={1}
        hintsTotal={1}
        isEditable={false}
        submitted
        onReveal={onReveal}
        onAddHint={vi.fn()}
      >
        <p>Hint body</p>
      </Hints>,
    );

    expect(screen.queryByRole("button", { name: "Show 1 hint" })).toBeNull();
    expect(screen.queryByText("Hint body")).toBeNull();
    expect(onReveal).not.toHaveBeenCalled();
  });

  it("keeps revealed hints popover-backed in the legacy shared runtime branch", () => {
    render(
      <Hints
        hintsShown={1}
        hintsTotal={2}
        isEditable={false}
        submitted={false}
        onReveal={vi.fn()}
        onAddHint={vi.fn()}
      >
        <p>Look for the strongest distractor.</p>
      </Hints>,
    );

    expect(screen.queryByText("Look for the strongest distractor.")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show next hint" }));

    const dialog = screen.getByRole("dialog", { name: "Hint 1 of 2" });
    expect(within(dialog).getByText("Look for the strongest distractor.")).toBeInTheDocument();
  });

  it("dismisses runtime hints through the wrapped popover content", async () => {
    render(
      <Hints
        hintsShown={1}
        hintsTotal={1}
        isEditable={false}
        submitted={false}
        onReveal={vi.fn()}
        onAddHint={vi.fn()}
      >
        <p>Check the units.</p>
      </Hints>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Show 1 hint" }));
    expect(screen.getByRole("dialog", { name: "Hint 1 of 1" })).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Hint 1 of 1" })).toBeNull();
      expect(screen.getByRole("button", { name: "Show 1 hint" })).toBeInstanceOf(HTMLButtonElement);
    });
  });

  it("uses the authored hint total while progressively revealing runtime hints", () => {
    function RuntimeHintsHarness() {
      const [hintsShown, setHintsShown] = useState(1);
      const hints = [
        "Read the prompt carefully.",
        "Eliminate the distractor.",
        "Check the final wording.",
      ];

      return (
        <Hints
          hintsShown={hintsShown}
          hintsTotal={hints.length}
          isEditable={false}
          submitted={false}
          onReveal={() => setHintsShown((current) => Math.min(current + 1, hints.length))}
          onAddHint={vi.fn()}
        >
          {hints.slice(0, hintsShown).map((hint) => (
            <div data-slot="assessment-hint" key={hint}>
              <p>{hint}</p>
            </div>
          ))}
        </Hints>
      );
    }

    render(<RuntimeHintsHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Show next hint" }));
    let dialog = screen.getByRole("dialog", { name: "Hint 2 of 3" });
    expect(within(dialog).getByText("Eliminate the distractor.")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Next hint" }));
    dialog = screen.getByRole("dialog", { name: "Hint 3 of 3" });
    expect(within(dialog).getByText("Check the final wording.")).toBeInTheDocument();
  });
});
