// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { Card, CardBody, CardLabel, CardTitle, cardVariants } from "./Card";

describe("Card", () => {
  it("reflects its visual contract through semantic classes and data attributes", () => {
    render(
      <Card variant="interactive" padding="lg">
        <CardLabel>Category</CardLabel>
        <CardTitle>Card title</CardTitle>
        <CardBody>Supporting copy.</CardBody>
      </Card>,
    );

    const card = screen.getByText("Card title").closest(".sc-card");

    expect(card).not.toBeNull();
    expect(card?.getAttribute("data-variant")).toBe("interactive");
    expect(card?.getAttribute("data-padding")).toBe("lg");
    expect(screen.getByText("Category").classList.contains("sc-card-label")).toBe(true);
    expect(screen.getByText("Card title").classList.contains("sc-card-title")).toBe(true);
    expect(screen.getByText("Supporting copy.").classList.contains("sc-card-body")).toBe(true);
  });

  it("keeps the exported variant helper available", () => {
    expect(cardVariants({ variant: "selected", padding: "sm" })).toBe("sc-card");
  });
});
