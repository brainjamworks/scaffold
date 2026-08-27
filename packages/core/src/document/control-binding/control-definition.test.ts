import { describe, expect, it } from "vite-plus/test";

import { normalizeControlDefinition, type ControlDefinition } from "./control-definition";

describe("normalizeControlDefinition", () => {
  it("leaves passive definitions absent", () => {
    expect(normalizeControlDefinition(undefined)).toBeUndefined();
  });

  it("owns and deeply freezes an owner-only declaration", () => {
    const events = [{ type: "submitted", label: "Submitted" }] as const;
    const control = {
      owner: { events },
    } satisfies ControlDefinition;

    const normalized = normalizeControlDefinition(control);

    expect(normalized).toEqual(control);
    expect(normalized).not.toBe(control);
    expect(normalized?.owner).not.toBe(control.owner);
    expect(normalized?.owner?.events).not.toBe(events);
    expect(normalized?.owner?.events?.[0]).not.toBe(events[0]);
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(Object.isFrozen(normalized?.owner)).toBe(true);
    expect(Object.isFrozen(normalized?.owner?.events)).toBe(true);
    expect(Object.isFrozen(normalized?.owner?.events?.[0])).toBe(true);
    expect(Object.isFrozen(control)).toBe(false);
    expect(Object.isFrozen(control.owner)).toBe(false);
    expect(Object.isFrozen(events)).toBe(false);
  });

  it("owns and deeply freezes a semantic-child-only declaration", () => {
    const options = [
      { value: "idle", label: "Idle" },
      { value: "playing", label: "Playing" },
    ] as const;
    const control = {
      semanticChildren: {
        media_item: {
          states: [
            {
              key: "status",
              label: "Status",
              valueType: { kind: "enum", options },
            },
          ],
        },
      },
    } satisfies ControlDefinition;

    const normalized = normalizeControlDefinition(control);
    const state = normalized?.semanticChildren?.["media_item"]?.states?.[0];

    expect(normalized).toEqual(control);
    expect(normalized?.semanticChildren).not.toBe(control.semanticChildren);
    expect(state?.valueType).not.toBe(control.semanticChildren.media_item.states[0].valueType);
    expect(state?.valueType.kind === "enum" ? state.valueType.options : undefined).not.toBe(
      options,
    );
    expect(Object.isFrozen(normalized?.semanticChildren)).toBe(true);
    expect(Object.isFrozen(normalized?.semanticChildren?.["media_item"])).toBe(true);
    expect(Object.isFrozen(state?.valueType)).toBe(true);
    expect(
      Object.isFrozen(state?.valueType.kind === "enum" ? state.valueType.options : undefined),
    ).toBe(true);
    expect(
      Object.isFrozen(state?.valueType.kind === "enum" ? state.valueType.options[0] : undefined),
    ).toBe(true);
  });

  it("normalizes mixed capabilities with every bounded value kind", () => {
    const control = {
      owner: {
        states: [
          { key: "enabled", label: "Enabled", valueType: { kind: "boolean" } },
          {
            key: "progress",
            label: "Progress",
            valueType: { kind: "number", min: 0, max: 1, unitLabel: "%", step: 0.25 },
          },
        ],
      },
      semanticChildren: {
        panel: {
          events: [{ type: "selected", label: "Selected" }],
          commands: [
            { type: "select", label: "Select" },
            {
              type: "set-priority",
              label: "Set priority",
              input: {
                kind: "enum",
                options: [
                  { value: "low", label: "Low" },
                  { value: "high", label: "High" },
                ],
              },
            },
          ],
        },
      },
    } satisfies ControlDefinition;

    const normalized = normalizeControlDefinition(control);

    expect(normalized).toEqual(control);
    expect(Object.isFrozen(normalized?.owner?.states)).toBe(true);
    expect(Object.isFrozen(normalized?.owner?.states?.[1]?.valueType)).toBe(true);
    expect(Object.isFrozen(normalized?.semanticChildren?.["panel"]?.commands)).toBe(true);
    expect(Object.isFrozen(normalized?.semanticChildren?.["panel"]?.commands?.[1]?.input)).toBe(
      true,
    );
  });

  it("normalizes a command-only runtime-bounded numeric input without weakening state numbers", () => {
    const control = {
      owner: {
        commands: [
          {
            type: "seek-to",
            label: "Seek to",
            input: {
              kind: "runtime-bounded-number",
              min: 0,
              unitLabel: "seconds",
              step: 0.25,
            },
          },
        ],
      },
    };

    const normalized = normalizeControlDefinition(control as never);

    expect(normalized).toEqual(control);
    expect(Object.isFrozen(normalized?.owner?.commands?.[0]?.input)).toBe(true);
  });

  it("normalizes an explicitly runtime-bounded numeric state without inventing its live maximum", () => {
    const control = {
      owner: {
        states: [
          {
            key: "page-number",
            label: "Page number",
            valueType: {
              kind: "runtime-bounded-number",
              min: 1,
              unitLabel: "page",
              step: 1,
            },
          },
        ],
      },
    };

    const normalized = normalizeControlDefinition(control as never);

    expect(normalized).toEqual(control);
    expect(Object.isFrozen(normalized?.owner?.states?.[0]?.valueType)).toBe(true);
  });

  it.each([
    {
      valueType: {
        kind: "runtime-bounded-number",
        min: Number.NaN,
        unitLabel: "page",
      },
      message: "minimum must be finite",
    },
    {
      valueType: { kind: "runtime-bounded-number", min: 1, unitLabel: "page", step: 0 },
      message: "step must be finite and positive",
    },
  ])("rejects an invalid runtime-bounded numeric state", ({ valueType, message }) => {
    expect(() =>
      normalizeControlDefinition({
        owner: {
          states: [{ key: "page-number", label: "Page number", valueType }],
        },
      } as never),
    ).toThrow(message);
  });

  it.each([
    {
      name: "an empty definition",
      control: {},
      message:
        "Control definition must declare at least one non-empty owner or semantic-child capability set.",
    },
    {
      name: "an empty owner capability set",
      control: { owner: {} },
      message: 'Control capability set "owner" must declare at least one capability.',
    },
    {
      name: "an empty semantic-children map",
      control: { semanticChildren: {} },
      message:
        "Control definition must declare at least one non-empty owner or semantic-child capability set.",
    },
    {
      name: "an empty semantic-child capability set",
      control: { semanticChildren: { panel: {} } },
      message:
        'Control capability set "semanticChildren.panel" must declare at least one capability.',
    },
    {
      name: "an empty event tuple",
      control: { owner: { events: [] } },
      message: 'Control capability set "owner" events must be non-empty.',
    },
    {
      name: "an empty state tuple",
      control: { owner: { states: [] } },
      message: 'Control capability set "owner" states must be non-empty.',
    },
    {
      name: "an empty command tuple",
      control: { owner: { commands: [] } },
      message: 'Control capability set "owner" commands must be non-empty.',
    },
  ])("rejects $name", ({ control, message }) => {
    expect(() => normalizeControlDefinition(control as never)).toThrow(message);
  });

  it.each([
    {
      name: "event types",
      control: {
        owner: {
          events: [
            { type: "selected", label: "Selected" },
            { type: "selected", label: "Selected again" },
          ],
        },
      },
      message: 'Control capability set "owner" contains duplicate event type "selected".',
    },
    {
      name: "state keys",
      control: {
        semanticChildren: {
          panel: {
            states: [
              { key: "selected", label: "Selected", valueType: { kind: "boolean" } },
              { key: "selected", label: "Selected again", valueType: { kind: "boolean" } },
            ],
          },
        },
      },
      message:
        'Control capability set "semanticChildren.panel" contains duplicate state key "selected".',
    },
    {
      name: "command types",
      control: {
        owner: {
          commands: [
            { type: "select", label: "Select" },
            { type: "select", label: "Select again" },
          ],
        },
      },
      message: 'Control capability set "owner" contains duplicate command type "select".',
    },
  ])("rejects duplicate $name per target", ({ control, message }) => {
    expect(() => normalizeControlDefinition(control as never)).toThrow(message);
  });

  it.each([
    {
      name: "fewer than two enum options",
      valueType: { kind: "enum", options: [{ value: "only", label: "Only" }] },
      message: "enum must declare at least two options",
    },
    {
      name: "duplicate enum values",
      valueType: {
        kind: "enum",
        options: [
          { value: "same", label: "First" },
          { value: "same", label: "Second" },
        ],
      },
      message: 'enum contains duplicate option value "same"',
    },
    {
      name: "a non-finite minimum",
      valueType: { kind: "number", min: Number.NEGATIVE_INFINITY, max: 10, unitLabel: "items" },
      message: "number bounds must be finite",
    },
    {
      name: "a non-finite maximum",
      valueType: { kind: "number", min: 0, max: Number.NaN, unitLabel: "items" },
      message: "number bounds must be finite",
    },
    {
      name: "equal numeric bounds",
      valueType: { kind: "number", min: 1, max: 1, unitLabel: "items" },
      message: "number maximum must be greater than its minimum",
    },
    {
      name: "reversed numeric bounds",
      valueType: { kind: "number", min: 2, max: 1, unitLabel: "items" },
      message: "number maximum must be greater than its minimum",
    },
    {
      name: "a non-finite numeric step",
      valueType: { kind: "number", min: 0, max: 10, unitLabel: "items", step: Number.NaN },
      message: "number step must be finite and positive",
    },
    {
      name: "a zero numeric step",
      valueType: { kind: "number", min: 0, max: 10, unitLabel: "items", step: 0 },
      message: "number step must be finite and positive",
    },
    {
      name: "a negative numeric step",
      valueType: { kind: "number", min: 0, max: 10, unitLabel: "items", step: -1 },
      message: "number step must be finite and positive",
    },
    {
      name: "a numeric step incompatible with the range",
      valueType: { kind: "number", min: 0, max: 1, unitLabel: "%", step: 0.3 },
      message: "number step must divide the declared range",
    },
  ])("rejects $name", ({ valueType, message }) => {
    expect(() =>
      normalizeControlDefinition({
        owner: {
          states: [{ key: "value", label: "Value", valueType }],
        },
      } as never),
    ).toThrow(message);
  });
});
