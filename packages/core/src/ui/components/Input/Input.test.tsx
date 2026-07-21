// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { Field, FieldError, HelpText, Input, Label, Textarea, inputVariants } from "./Input";

describe("Input primitives", () => {
  it("reflects the input visual contract through semantic classes", () => {
    render(<Input aria-label="Title" invalid />);

    const input = screen.getByRole("textbox", { name: "Title" });

    expect(input.classList.contains("sc-input")).toBe(true);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("data-invalid")).toBe("true");
    expect(input.getAttribute("type")).toBe("text");
  });

  it("preserves explicit input types", () => {
    render(<Input aria-label="Count" type="number" />);

    expect(screen.getByLabelText("Count").getAttribute("type")).toBe("number");
  });

  it("reflects the textarea visual contract", () => {
    render(<Textarea aria-label="Description" invalid rows={5} />);

    const textarea = screen.getByRole("textbox", { name: "Description" });

    expect(textarea.classList.contains("sc-input")).toBe(true);
    expect(textarea.classList.contains("sc-textarea")).toBe(true);
    expect(textarea.getAttribute("aria-invalid")).toBe("true");
    expect(textarea.getAttribute("data-invalid")).toBe("true");
    expect(textarea.getAttribute("rows")).toBe("5");
  });

  it("reflects field composition classes and alert semantics", () => {
    render(
      <Field>
        <Label htmlFor="field-id">Question</Label>
        <Input id="field-id" />
        <HelpText>Shown to authors.</HelpText>
        <FieldError>Required.</FieldError>
      </Field>,
    );

    expect(screen.getByLabelText("Question").classList.contains("sc-input")).toBe(true);
    expect(screen.getByText("Question").classList.contains("sc-field-label")).toBe(true);
    expect(screen.getByText("Shown to authors.").classList.contains("sc-field-help")).toBe(true);
    expect(screen.getByRole("alert").classList.contains("sc-field-error")).toBe(true);
  });

  it("keeps the exported variant helper available", () => {
    expect(inputVariants({ invalid: true })).toBe("sc-input");
  });
});
