import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Badge, Card, EmptyState } from './ui';

export interface MemoryGraphNode {
  id: string;
  kind: string;
  title: string;
  importance: number;
  tags: string[];
  projectId?: string | null;
}

export type MemoryGraphEdgeKind = 'cluster' | 'chain' | 'contradiction';

export interface MemoryGraphEdge {
  id: string;
  source: string;
  target: string;
  kind: MemoryGraphEdgeKind;
  label?: string;
}

export interface MemoryGraphData {
  nodes: MemoryGraphNode[];
  edges: MemoryGraphEdge[];
}

interface Point {
  x: number;
  y: number;
}

const EDGE_COLORS: Record<MemoryGraphEdgeKind, string> = {
  cluster: '#06b6d4',
  chain: '#8b5cf6',
  contradiction: '#f43f5e',
};

const NODE_KIND_COLORS: Record<string, string> = {
  episodic: '#a78bfa',
  semantic: '#22d3ee',
  preference: '#fbbf24',
  reflexion: '#34d399',
  fact: '#fb7185',
};

function nodeColor(kind: string): string {
  return NODE_KIND_COLORS[kind] ?? '#64748b';
}

function nodeRadius(importance: number): number {
  const clamped = Math.max(0, Math.min(1, importance));
  return 6 + clamped * 12;
}

function computeLayout(
  nodes: MemoryGraphNode[],
  edges: MemoryGraphEdge[],
  width: number,
  height: number
): Map<string, Point> {
  const pos = new Map<string, Point>();
  const n = nodes.length;
  if (n === 0) return pos;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.max(40, Math.min(width, height) / 2 - 50);
  nodes.forEach((node, i) => {
    const angle = (i / Math.max(n, 1)) * Math.PI * 2;
    pos.set(node.id, {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    });
  });
  if (n === 1) return pos;

  const k = Math.sqrt((width * height) / n) * 0.7;
  const iterations = 140;
  for (let iter = 0; iter < iterations; iter++) {
    const disp = new Map<string, Point>();
    for (const node of nodes) disp.set(node.id, { x: 0, y: 0 });

    for (let i = 0; i < n; i++) {
      const a = nodes[i];
      if (!a) continue;
      const pa = pos.get(a.id);
      if (!pa) continue;
      for (let j = i + 1; j < n; j++) {
        const b = nodes[j];
        if (!b) continue;
        const pb = pos.get(b.id);
        if (!pb) continue;
        let dx = pa.x - pb.x;
        let dy = pa.y - pb.y;
        let distSq = dx * dx + dy * dy;
        if (distSq < 0.01) {
          dx = Math.random() - 0.5;
          dy = Math.random() - 0.5;
          distSq = dx * dx + dy * dy + 0.01;
        }
        const dist = Math.sqrt(distSq);
        const force = (k * k) / distSq;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        const da = disp.get(a.id);
        const db = disp.get(b.id);
        if (da) {
          da.x += fx;
          da.y += fy;
        }
        if (db) {
          db.x -= fx;
          db.y -= fy;
        }
      }
    }

    for (const e of edges) {
      const ps = pos.get(e.source);
      const pt = pos.get(e.target);
      if (!ps || !pt) continue;
      const dx = pt.x - ps.x;
      const dy = pt.y - ps.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const force = (dist * dist) / k;
      const fx = (dx / dist) * force * 0.4;
      const fy = (dy / dist) * force * 0.4;
      const ds = disp.get(e.source);
      const dt = disp.get(e.target);
      if (ds) {
        ds.x += fx;
        ds.y += fy;
      }
      if (dt) {
        dt.x -= fx;
        dt.y -= fy;
      }
    }

    const cooling = 1 - iter / iterations;
    for (const node of nodes) {
      const p = pos.get(node.id);
      const d = disp.get(node.id);
      if (!p || !d) continue;
      const len = Math.sqrt(d.x * d.x + d.y * d.y) || 0.01;
      const lim = Math.min(len, 24 * cooling + 1);
      p.x += (d.x / len) * lim;
      p.y += (d.y / len) * lim;
      p.x += (cx - p.x) * 0.015;
      p.y += (cy - p.y) * 0.015;
    }
  }
  return pos;
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

export interface MemoryGraphProps {
  data: MemoryGraphData;
  width?: number;
  height?: number;
}

function MemoryGraphImpl({ data, width = 860, height = 560 }: MemoryGraphProps) {
  const initial = useMemo(
    () => computeLayout(data.nodes, data.edges, width, height),
    [data.nodes, data.edges, width, height]
  );
  const [positions, setPositions] = useState<Map<string, Point>>(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<string | null>(null);

  useEffect(() => {
    setPositions(initial);
  }, [initial]);

  const toSvg = useCallback(
    (e: ReactPointerEvent) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      const x = ((e.clientX - rect.left) / rect.width) * width;
      const y = ((e.clientY - rect.top) / rect.height) * height;
      return { x, y };
    },
    [width, height]
  );

  const onNodePointerDown = useCallback((e: ReactPointerEvent, id: string) => {
    e.stopPropagation();
    dragRef.current = id;
    setSelected(id);
  }, []);

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      const id = dragRef.current;
      if (!id) return;
      const { x, y } = toSvg(e);
      setPositions((prev) => {
        const next = new Map(prev);
        const p = next.get(id);
        if (p) next.set(id, { x, y });
        return next;
      });
    },
    [toSvg]
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const activeId = hovered ?? selected;
  const neighbors = useMemo(() => {
    const set = new Set<string>();
    if (activeId) {
      set.add(activeId);
      for (const e of data.edges) {
        if (e.source === activeId) set.add(e.target);
        if (e.target === activeId) set.add(e.source);
      }
    }
    return set;
  }, [activeId, data.edges]);

  if (data.nodes.length === 0) {
    return (
      <Card className="p-6">
        <EmptyState
          title="No memories to graph"
          hint="Capture or import memories, then revisit this view."
        />
      </Card>
    );
  }

  const selectedNode = data.nodes.find((nd) => nd.id === selected) ?? null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <LegendDot color={EDGE_COLORS.cluster} label="cluster" />
        <LegendDot color={EDGE_COLORS.chain} label="chain" />
        <LegendDot color={EDGE_COLORS.contradiction} label="contradiction" />
        <span className="text-slate-600">·</span>
        <span>
          {data.nodes.length} nodes · {data.edges.length} edges
        </span>
      </div>
      <Card className="overflow-hidden">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full select-none"
          style={{ height }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          <rect x={0} y={0} width={width} height={height} fill="transparent" />
          {data.edges.map((e) => {
            const ps = positions.get(e.source);
            const pt = positions.get(e.target);
            if (!ps || !pt) return null;
            const dim = activeId !== null && !(neighbors.has(e.source) && neighbors.has(e.target));
            return (
              <line
                key={e.id}
                x1={ps.x}
                y1={ps.y}
                x2={pt.x}
                y2={pt.y}
                stroke={EDGE_COLORS[e.kind] ?? '#475569'}
                strokeWidth={e.kind === 'contradiction' ? 2 : 1}
                strokeOpacity={dim ? 0.08 : 0.5}
              />
            );
          })}
          {data.nodes.map((nd) => {
            const p = positions.get(nd.id) ?? { x: width / 2, y: height / 2 };
            const r = nodeRadius(nd.importance);
            const dim = activeId !== null && !neighbors.has(nd.id);
            return (
              <g
                key={nd.id}
                transform={`translate(${p.x}, ${p.y})`}
                className="cursor-pointer"
                opacity={dim ? 0.25 : 1}
                onPointerDown={(e) => onNodePointerDown(e, nd.id)}
                onPointerEnter={() => setHovered(nd.id)}
                onPointerLeave={() => setHovered((prev) => (prev === nd.id ? null : prev))}
              >
                <circle
                  r={r}
                  fill={nodeColor(nd.kind)}
                  fillOpacity={0.85}
                  stroke="#0b1220"
                  strokeWidth={1.5}
                />
                <text
                  x={r + 4}
                  y={4}
                  className="text-[10px] font-medium"
                  fill="#cbd5e1"
                  style={{ pointerEvents: 'none' }}
                >
                  {nd.title.length > 28 ? `${nd.title.slice(0, 27)}…` : nd.title}
                </text>
              </g>
            );
          })}
        </svg>
      </Card>
      {selectedNode && (
        <Card className="p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-100">{selectedNode.title}</h3>
            <Badge tone="cyan">{selectedNode.kind}</Badge>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {selectedNode.tags.map((t) => (
              <Badge key={t} tone="slate">
                #{t}
              </Badge>
            ))}
          </div>
          <div className="mt-2 text-xs text-slate-400">
            importance: {selectedNode.importance.toFixed(2)}
            {selectedNode.projectId ? ` · project: ${selectedNode.projectId}` : ''}
          </div>
        </Card>
      )}
    </div>
  );
}

export const MemoryGraph = memo(MemoryGraphImpl);
