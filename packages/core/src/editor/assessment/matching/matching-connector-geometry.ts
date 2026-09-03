import { measureElementLocalCoordinateSpace } from "@/editor/interactions/drag/dom/element-local-coordinate-space";
import { createClientPoint } from "@/editor/interactions/drag/model/coordinate-space";

import { MATCHING_CONNECTOR_PADDING, type MatchingConnector } from "./matching-fields-shared";

export interface MatchingConnectorConnection {
  readonly itemId: string;
  readonly targetId: string;
  readonly state: MatchingConnector["state"];
}

export interface MatchingConnectorGeometryInput {
  readonly connections: readonly MatchingConnectorConnection[];
  readonly container: HTMLElement;
  readonly svg: SVGSVGElement;
}

export function createMatchingConnectorRevision(
  matches: Readonly<Record<string, string>>,
  feedbackItems: Readonly<Record<string, Readonly<{ correct: boolean }>>>,
): string {
  return JSON.stringify({
    matches: Object.entries(matches).sort(([a], [b]) => a.localeCompare(b)),
    feedback: Object.entries(feedbackItems)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([itemId, item]) => [itemId, item.correct]),
  });
}

export function measureMatchingConnectorGeometry({
  connections,
  container,
  svg,
}: MatchingConnectorGeometryInput): MatchingConnector[] {
  if (!container.isConnected || !svg.isConnected || svg.ownerDocument !== container.ownerDocument) {
    return [];
  }
  const coordinateSpace = measureElementLocalCoordinateSpace(svg);
  if (!coordinateSpace) return [];

  const connectors: MatchingConnector[] = [];
  for (const connection of connections) {
    const item = elementByDataAttr(container, "data-item-id", connection.itemId);
    const target = elementByDataAttr(container, "data-target-id", connection.targetId);
    if (!item || !target || !item.isConnected || !target.isConnected) return [];
    const itemRect = item.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    if (!validEndpointRect(itemRect) || !validEndpointRect(targetRect)) return [];
    const itemEdge = createClientPoint(itemRect.right, itemRect.top + itemRect.height / 2);
    const targetEdge = createClientPoint(targetRect.left, targetRect.top + targetRect.height / 2);
    if (!itemEdge || !targetEdge) return [];
    const start = coordinateSpace.clientPointToLocal(itemEdge);
    const end = coordinateSpace.clientPointToLocal(targetEdge);
    connectors.push({
      itemId: connection.itemId,
      targetId: connection.targetId,
      startX: start.x + MATCHING_CONNECTOR_PADDING,
      startY: start.y,
      endX: end.x - MATCHING_CONNECTOR_PADDING,
      endY: end.y,
      state: connection.state,
    });
  }
  return connectors;
}

export function sameMatchingConnectors(
  a: readonly MatchingConnector[],
  b: readonly MatchingConnector[],
): boolean {
  return (
    a.length === b.length &&
    a.every((connector, index) => {
      const other = b[index];
      return (
        other !== undefined &&
        connector.itemId === other.itemId &&
        connector.targetId === other.targetId &&
        connector.startX === other.startX &&
        connector.startY === other.startY &&
        connector.endX === other.endX &&
        connector.endY === other.endY &&
        connector.state === other.state
      );
    })
  );
}

function elementByDataAttr(
  container: HTMLElement,
  attr: "data-item-id" | "data-target-id",
  value: string,
): HTMLElement | null {
  return (
    Array.from(container.querySelectorAll<HTMLElement>(`[${attr}]`)).find(
      (element) => element.getAttribute(attr) === value,
    ) ?? null
  );
}

function validEndpointRect(rect: DOMRect): boolean {
  return (
    [rect.left, rect.top, rect.right, rect.bottom, rect.width, rect.height].every(
      Number.isFinite,
    ) &&
    rect.width > 0 &&
    rect.height > 0
  );
}
