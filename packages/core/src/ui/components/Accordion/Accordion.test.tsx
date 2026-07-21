// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { Accordion } from "./Accordion";

describe("Accordion", () => {
  it("reflects its visual contract through semantic classes", () => {
    render(
      <Accordion.Root type="single" value="details">
        <Accordion.Item value="details">
          <Accordion.Header>Details</Accordion.Header>
          <Accordion.Content>Configuration fields</Accordion.Content>
        </Accordion.Item>
      </Accordion.Root>,
    );

    const item = screen.getByText("Configuration fields").closest("[data-state]");
    const trigger = screen.getByRole("button", { name: "Details" });

    expect(trigger.closest(".sc-accordion-item")).not.toBeNull();
    expect(trigger.closest(".sc-accordion-header")).not.toBeNull();
    expect(trigger.classList.contains("sc-accordion-trigger")).toBe(true);
    expect(trigger.querySelector(".sc-accordion-trigger-label")?.textContent).toBe("Details");
    expect(trigger.querySelector(".sc-accordion-trigger-icon")).not.toBeNull();
    expect(item?.classList.contains("sc-accordion-content")).toBe(true);
    expect(
      screen.getByText("Configuration fields").closest(".sc-accordion-content-inner"),
    ).not.toBeNull();
  });

  it("preserves consumer class names", () => {
    render(
      <Accordion.Root type="single" value="details">
        <Accordion.Item value="details" className="custom-item">
          <Accordion.Header className="custom-trigger">Details</Accordion.Header>
          <Accordion.Content className="custom-content">Fields</Accordion.Content>
        </Accordion.Item>
      </Accordion.Root>,
    );

    const trigger = screen.getByRole("button", { name: "Details" });

    expect(trigger.closest(".custom-item")).not.toBeNull();
    expect(trigger.classList.contains("custom-trigger")).toBe(true);
    expect(screen.getByText("Fields").closest(".custom-content")).not.toBeNull();
  });
});
