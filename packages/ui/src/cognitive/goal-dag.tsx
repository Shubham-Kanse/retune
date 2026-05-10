"use client";

import { useEffect, useRef } from "react";

interface GoalNode {
  id: string;
  kind: string;
  status: "pending" | "active" | "satisfied" | "abandoned";
  parentId: string | null;
}

interface GoalDagProps {
  goals: GoalNode[];
  className?: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "#94a3b8",
  active: "oklch(0.72 0.15 200)",
  satisfied: "oklch(0.72 0.15 155)",
  abandoned: "#6b7280",
};

export function GoalDag({ goals, className }: GoalDagProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || goals.length === 0) return;
    const svg = svgRef.current;
    const width = svg.clientWidth || 400;
    const height = svg.clientHeight || 300;

    // Simple force-layout approximation (no d3 dependency)
    const positions = computeLayout(goals, width, height);

    // Clear and redraw
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // Draw edges
    for (const goal of goals) {
      if (!goal.parentId) continue;
      const from = positions.get(goal.parentId);
      const to = positions.get(goal.id);
      if (!from || !to) continue;

      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", String(from.x));
      line.setAttribute("y1", String(from.y));
      line.setAttribute("x2", String(to.x));
      line.setAttribute("y2", String(to.y));
      line.setAttribute("stroke", "currentColor");
      line.setAttribute("stroke-opacity", "0.15");
      line.setAttribute("stroke-width", "1");
      svg.appendChild(line);
    }

    // Draw nodes
    for (const goal of goals) {
      const pos = positions.get(goal.id);
      if (!pos) continue;

      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", String(pos.x));
      circle.setAttribute("cy", String(pos.y));
      circle.setAttribute("r", goal.status === "active" ? "6" : "4");
      circle.setAttribute("fill", (STATUS_COLORS[goal.status] as string | undefined) ?? "#94a3b8");
      if (goal.status === "active") {
        circle.setAttribute("stroke", STATUS_COLORS.active ?? "oklch(0.72 0.15 200)");
        circle.setAttribute("stroke-width", "2");
        circle.setAttribute("stroke-opacity", "0.4");
      }
      svg.appendChild(circle);

      // Label
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", String(pos.x));
      text.setAttribute("y", String(pos.y + 14));
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("font-size", "9");
      text.setAttribute("fill", "currentColor");
      text.setAttribute("opacity", "0.5");
      text.textContent = goal.kind.replace(/_/g, " ").slice(0, 16);
      svg.appendChild(text);
    }
  }, [goals]);

  if (goals.length === 0) {
    return (
      <div className={`text-sm text-muted-foreground ${className ?? ""}`}>
        No goals emitted yet.
      </div>
    );
  }

  return <svg ref={svgRef} className={`w-full h-64 ${className ?? ""}`} />;
}

function computeLayout(
  goals: GoalNode[],
  width: number,
  height: number,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();

  // Group by depth (BFS from roots)
  const children = new Map<string | null, GoalNode[]>();
  for (const g of goals) {
    const parent = g.parentId;
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent)?.push(g);
  }

  const queue: Array<{ id: string; depth: number }> = [];
  const roots = children.get(null) ?? [];
  for (const r of roots) queue.push({ id: r.id, depth: 0 });

  const depthMap = new Map<string, number>();
  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) break;
    const { id, depth } = item;
    depthMap.set(id, depth);
    const kids = children.get(id) ?? [];
    for (const k of kids) queue.push({ id: k.id, depth: depth + 1 });
  }

  // Assign without depthMap for orphans
  for (const g of goals) {
    if (!depthMap.has(g.id)) depthMap.set(g.id, 0);
  }

  const maxDepth = Math.max(...depthMap.values(), 0);
  const depthGroups = new Map<number, string[]>();
  for (const [id, d] of depthMap) {
    if (!depthGroups.has(d)) depthGroups.set(d, []);
    depthGroups.get(d)?.push(id);
  }

  const padX = 40;
  const padY = 30;
  for (const [depth, ids] of depthGroups) {
    const y = padY + (maxDepth > 0 ? (depth / maxDepth) * (height - padY * 2) : height / 2);
    const step = (width - padX * 2) / (ids.length + 1);
    ids.forEach((id, i) => {
      positions.set(id, { x: padX + step * (i + 1), y });
    });
  }

  return positions;
}
