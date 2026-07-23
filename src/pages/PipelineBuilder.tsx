import { useState, useCallback, useRef, useEffect, type DragEvent } from "react";
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Node,
  type Edge,
  type NodeProps,
  type NodeTypes,
  type OnConnect,
  useReactFlow,
  ReactFlowProvider,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/base.css";
import { Badge, Button, Card, Field, Input, Modal, Select, Textarea, cn } from "../components/ui";
import { toast } from "../lib/toast";
import { motion, AnimatePresence } from "motion/react";
import { apiClient } from "../lib/api-client";

/* ─── Block type registry ──────────────────────────────────────────────────── */

interface BlockConfigField {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "textarea";
  default: string | number;
  options?: { label: string; value: string }[];
  min?: number;
  max?: number;
  step?: number;
}

interface BlockTypeDefinition {
  type: string;
  label: string;
  color: string;
  icon: string;
  inputs: number;
  outputs: number;
  config: BlockConfigField[];
  description: string;
}

const BLOCK_REGISTRY: BlockTypeDefinition[] = [
  {
    type: "agent",
    label: "Agent",
    color: "#06b6d4",
    icon: "🤖",
    inputs: 1,
    outputs: 1,
    description: "Execute an agent with a prompt",
    config: [
      { key: "agentId", label: "Agent ID", type: "text", default: "default-agent" },
      { key: "prompt", label: "System Prompt", type: "textarea", default: "You are a helpful assistant." },
      { key: "maxSteps", label: "Max Steps", type: "number", default: 10, min: 1, max: 100 },
    ],
  },
  {
    type: "tool",
    label: "Tool",
    color: "#10b981",
    icon: "🔧",
    inputs: 1,
    outputs: 1,
    description: "Call a tool with parameters",
    config: [
      { key: "toolName", label: "Tool Name", type: "select", default: "web_search", options: [
        { label: "Web Search", value: "web_search" },
        { label: "Code Interpreter", value: "code_interpreter" },
        { label: "File Reader", value: "file_reader" },
        { label: "Memory Recall", value: "memory_recall" },
        { label: "Vector Store", value: "vector_store" },
      ]},
      { key: "parameters", label: "Parameters (JSON)", type: "textarea", default: "{}" },
    ],
  },
  {
    type: "llm",
    label: "LLM",
    color: "#8b5cf6",
    icon: "🧠",
    inputs: 1,
    outputs: 1,
    description: "Query a language model",
    config: [
      { key: "model", label: "Model", type: "select", default: "gpt-4o", options: [
        { label: "GPT-4o", value: "gpt-4o" },
        { label: "GPT-4o-mini", value: "gpt-4o-mini" },
        { label: "Claude 3.5 Sonnet", value: "claude-3.5-sonnet" },
        { label: "Claude 3 Haiku", value: "claude-3-haiku" },
        { label: "Gemini Pro", value: "gemini-pro" },
        { label: "Llama 3.1 70B", value: "llama-3.1-70b" },
      ]},
      { key: "temperature", label: "Temperature", type: "number", default: 0.7, min: 0, max: 2, step: 0.1 },
      { key: "maxTokens", label: "Max Tokens", type: "number", default: 2048, min: 64, max: 32768, step: 64 },
    ],
  },
  {
    type: "memory",
    label: "Memory",
    color: "#f59e0b",
    icon: "💾",
    inputs: 1,
    outputs: 1,
    description: "Read/write agent memory",
    config: [
      { key: "memoryType", label: "Memory Type", type: "select", default: "semantic", options: [
        { label: "Semantic", value: "semantic" },
        { label: "Episodic", value: "episodic" },
        { label: "Procedural", value: "procedural" },
      ]},
      { key: "operation", label: "Operation", type: "select", default: "read", options: [
        { label: "Read", value: "read" },
        { label: "Write", value: "write" },
        { label: "Recall", value: "recall" },
      ]},
      { key: "topK", label: "Top K Results", type: "number", default: 5, min: 1, max: 50 },
    ],
  },
  {
    type: "transform",
    label: "Transform",
    color: "#ec4899",
    icon: "🔄",
    inputs: 1,
    outputs: 1,
    description: "Transform data between blocks",
    config: [
      { key: "transformType", label: "Transform Type", type: "select", default: "json", options: [
        { label: "JSON Parse", value: "json_parse" },
        { label: "JSON Stringify", value: "json_stringify" },
        { label: "Filter", value: "filter" },
        { label: "Map", value: "map" },
        { label: "Merge", value: "merge" },
      ]},
      { key: "expression", label: "Expression", type: "textarea", default: "data => data" },
    ],
  },
  {
    type: "output",
    label: "Output",
    color: "#14b8a6",
    icon: "📤",
    inputs: 1,
    outputs: 0,
    description: "Display or export results",
    config: [
      { key: "outputType", label: "Output Type", type: "select", default: "log", options: [
        { label: "Log", value: "log" },
        { label: "Return", value: "return" },
        { label: "Export JSON", value: "export_json" },
        { label: "Export CSV", value: "export_csv" },
      ]},
      { key: "label", label: "Output Label", type: "text", default: "Result" },
    ],
  },
];

const BLOCK_TYPE_MAP = new Map(BLOCK_REGISTRY.map((b) => [b.type, b]));

/* ─── Execution status types ───────────────────────────────────────────────── */

type ExecStatus = "idle" | "running" | "completed" | "failed";

interface PipelineNodeData extends Record<string, unknown> {
  blockType: string;
  label: string;
  config: Record<string, string | number>;
  execStatus: ExecStatus;
  execResult?: string;
}

type PipelineNode = Node<PipelineNodeData>;

/* ─── Custom node components ───────────────────────────────────────────────── */

function PipelineNodeCard({ data, selected }: NodeProps<PipelineNode>) {
  const def = BLOCK_TYPE_MAP.get(data.blockType);
  if (!def) return null;
  const statusColors: Record<ExecStatus, string> = {
    idle: "border-slate-700",
    running: "border-cyan-400 shadow-lg shadow-cyan-500/30",
    completed: "border-emerald-400",
    failed: "border-rose-400",
  };
  return (
    <div
      className={cn(
        "min-w-[180px] rounded-xl border-2 bg-slate-900/90 backdrop-blur transition-shadow",
        statusColors[data.execStatus as ExecStatus] ?? "border-slate-700",
        selected && "ring-2 ring-cyan-400/50"
      )}
    >
      {def.inputs > 0 && (
        <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-slate-600 !bg-slate-900" />
      )}
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: "1px solid rgba(148,163,184,0.1)" }}>
        <span className="text-lg leading-none">{def.icon}</span>
        <span className="text-xs font-semibold text-slate-200">{data.label as string}</span>
        {data.execStatus === "running" && (
          <span className="ml-auto h-2 w-2 rounded-full bg-cyan-400 nexus-pulse" />
        )}
        {data.execStatus === "completed" && (
          <span className="ml-auto text-emerald-400 text-xs">✓</span>
        )}
        {data.execStatus === "failed" && (
          <span className="ml-auto text-rose-400 text-xs">✗</span>
        )}
      </div>
      <div className="px-3 py-1.5 text-[10px] text-slate-500">{def.description}</div>
      {def.outputs > 0 && (
        <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-slate-600 !bg-slate-900" />
      )}
    </div>
  );
}

const nodeTypes: NodeTypes = { pipeline: PipelineNodeCard };

/* ─── Drag-overlay preview ─────────────────────────────────────────────────── */

const BLOCK_PREVIEW_STYLES: Record<string, string> = {
  agent: "border-cyan-400/50 bg-cyan-500/10",
  tool: "border-emerald-400/50 bg-emerald-500/10",
  llm: "border-violet-400/50 bg-violet-500/10",
  memory: "border-amber-400/50 bg-amber-500/10",
  transform: "border-pink-400/50 bg-pink-500/10",
  output: "border-teal-400/50 bg-teal-500/10",
};

/* ─── Configuration panel ──────────────────────────────────────────────────── */

function ConfigPanel({
  node,
  onUpdate,
  onClose,
}: {
  node: PipelineNode;
  onUpdate: (id: string, config: Record<string, string | number>, label: string) => void;
  onClose: () => void;
}) {
  const def = BLOCK_TYPE_MAP.get(node.data.blockType);
  const [local, setLocal] = useState<Record<string, string | number>>({ ...node.data.config });
  const [label, setLabel] = useState(node.data.label);

  if (!def) return null;

  return (
    <Card className="w-72 shrink-0 border-l border-nexus-border overflow-y-auto">
      <div className="flex items-center justify-between border-b border-nexus-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{def.icon}</span>
          <span className="text-sm font-semibold text-slate-100">{def.label}</span>
        </div>
        <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200">✕</button>
      </div>
      <div className="space-y-3 p-4">
        <Field label="Label">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        {def.config.map((field) => {
          const val = local[field.key] ?? field.default;
          if (field.type === "select") {
            return (
              <Field key={field.key} label={field.label}>
                <Select
                  value={String(val)}
                  onChange={(e) => setLocal({ ...local, [field.key]: e.target.value })}
                >
                  {(field.options ?? []).map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>
              </Field>
            );
          }
          if (field.type === "textarea") {
            return (
              <Field key={field.key} label={field.label}>
                <Textarea
                  rows={3}
                  value={String(val)}
                  onChange={(e) => setLocal({ ...local, [field.key]: e.target.value })}
                />
              </Field>
            );
          }
          if (field.type === "number") {
            return (
              <Field key={field.key} label={field.label}>
                <Input
                  type="number"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={Number(val)}
                  onChange={(e) => setLocal({ ...local, [field.key]: parseFloat(e.target.value) || 0 })}
                />
              </Field>
            );
          }
          return (
            <Field key={field.key} label={field.label}>
              <Input value={String(val)} onChange={(e) => setLocal({ ...local, [field.key]: e.target.value })} />
            </Field>
          );
        })}
        <Button
          variant="primary"
          className="w-full"
          onClick={() => onUpdate(node.id, local, label)}
        >
          Apply
        </Button>
      </div>
    </Card>
  );
}

/* ─── Main PipelineBuilder component ───────────────────────────────────────── */

const INITIAL_VIEWPORT = { x: 0, y: 0, zoom: 1 };

const DEFAULT_EDGE_OPTIONS = {
  animated: true,
  style: { stroke: "#1c2740", strokeWidth: 2 },
  activeStyle: { stroke: "#06b6d4", strokeWidth: 2 },
};

let nodeIdCounter = 0;
function newNodeId() {
  nodeIdCounter += 1;
  return `node_${nodeIdCounter}_${Date.now()}`;
}

interface PipelineData {
  nodes: PipelineNode[];
  edges: Edge[];
}

function PipelineBuilderInner() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<PipelineNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<PipelineNode | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [pipelineName, setPipelineName] = useState("Untitled Pipeline");
  const [undoStack, setUndoStack] = useState<PipelineData[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [importJson, setImportJson] = useState("");
  const [showRunLog, setShowRunLog] = useState(false);
  const [runLog, setRunLog] = useState<string[]>([]);

  const saveSnapshot = useCallback(() => {
    setUndoStack((prev) => [...prev.slice(-49), { nodes: [...nodes], edges: [...edges] }]);
  }, [nodes, edges]);

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge({ ...connection, ...DEFAULT_EDGE_OPTIONS }, eds));
      saveSnapshot();
    },
    [setEdges, saveSnapshot]
  );

  const onNodeClick = useCallback((_event: React.MouseEvent, node: PipelineNode) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const onNodesDelete = useCallback(
    (deleted: Node[]) => {
      saveSnapshot();
      if (selectedNode && deleted.some((d) => d.id === selectedNode.id)) {
        setSelectedNode(null);
      }
    },
    [saveSnapshot, selectedNode]
  );

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const blockType = event.dataTransfer.getData("application/reactflow");
      if (!blockType || !BLOCK_TYPE_MAP.has(blockType)) return;
      const pos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const def = BLOCK_TYPE_MAP.get(blockType)!;
      const newNode: PipelineNode = {
        id: newNodeId(),
        type: "pipeline",
        position: pos,
        data: {
          blockType,
          label: def.label,
          config: Object.fromEntries(def.config.map((f) => [f.key, f.default])),
          execStatus: "idle",
        },
      };
      setNodes((nds) => [...nds, newNode]);
      saveSnapshot();
    },
    [screenToFlowPosition, setNodes, saveSnapshot]
  );

  const updateNodeConfig = useCallback(
    (id: string, config: Record<string, string | number>, label: string) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, config, label } } : n
        )
      );
      setSelectedNode((prev) =>
        prev?.id === id ? { ...prev, data: { ...prev.data, config, label } } : prev
      );
      toast.success("Configuration applied");
    },
    [setNodes]
  );

  const clearPipeline = useCallback(() => {
    saveSnapshot();
    setNodes([]);
    setEdges([]);
    setSelectedNode(null);
  }, [saveSnapshot, setNodes, setEdges]);

  const undo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const prevState = prev[prev.length - 1];
      setNodes(prevState.nodes);
      setEdges(prevState.edges);
      return prev.slice(0, -1);
    });
  }, [setNodes, setEdges]);

  const savePipeline = useCallback(async () => {
    const data: PipelineData = { nodes, edges };
    try {
      await apiClient.createPipeline({
        name: pipelineName,
        description: `Pipeline ${pipelineName}`,
        nodes: nodes.map((n) => ({ id: n.id, type: n.type ?? 'transform', position: n.position, data: n.data })),
        edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
      });
      toast.success(`Pipeline "${pipelineName}" saved`);
    } catch {
      toast.danger("Failed to save pipeline");
    }
  }, [nodes, edges, pipelineName]);

  const loadPipelineList = useCallback((): string[] => {
    // Synchronous stub: the real list is fetched asynchronously via refreshPipelineList().
    // Return [] here; callers should use the async path.
    return [];
  }, []);

  const loadPipeline = useCallback(
    async (name: string) => {
      try {
        const pipeline = await apiClient.getPipeline(name);
        saveSnapshot();
        // Map API PipelineNode[] back to ReactFlow Node[]
        const apiNodes: Node[] = pipeline.nodes.map((n) => ({
          id: n.id,
          type: n.type,
          position: n.position,
          data: n.data,
        }));
        const apiEdges: Edge[] = pipeline.edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
        }));
        setNodes(apiNodes);
        setEdges(apiEdges);
        setPipelineName(name);
        toast.success(`Pipeline "${name}" loaded`);
      } catch {
        toast.danger("Failed to load pipeline");
      }
    },
    [saveSnapshot, setNodes, setEdges]
  );

  const exportPipeline = useCallback(() => {
    const data: PipelineData = { nodes, edges };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${pipelineName.replace(/\s+/g, "_")}.pipeline.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Pipeline exported");
  }, [nodes, edges, pipelineName]);

  const importPipeline = useCallback(() => {
    try {
      const data: PipelineData = JSON.parse(importJson);
      if (!data.nodes || !data.edges) { toast.danger("Invalid pipeline format"); return; }
      saveSnapshot();
      setNodes(data.nodes);
      setEdges(data.edges);
      setShowImport(false);
      setImportJson("");
      toast.success("Pipeline imported");
    } catch {
      toast.danger("Invalid JSON");
    }
  }, [importJson, saveSnapshot, setNodes, setEdges]);

  const runPipeline = useCallback(async () => {
    if (nodes.length === 0) { toast.danger("Pipeline is empty"); return; }
    setIsRunning(true);
    setRunLog([]);
    setShowRunLog(true);
    const log: string[] = [];

    const resetAll = () => {
      setNodes((nds) => nds.map((n) => ({ ...n, data: { ...n.data, execStatus: "idle" as ExecStatus, execResult: undefined } })));
    };
    resetAll();

    const sorted = topoSort(nodes, edges);
    if (sorted.length === 0) {
      toast.danger("Pipeline has cycles or no valid execution order");
      setIsRunning(false);
      return;
    }

    for (let i = 0; i < sorted.length; i++) {
      const node = sorted[i];
      const def = BLOCK_TYPE_MAP.get(node.data.blockType);
      if (!def) continue;

      setNodes((nds) =>
        nds.map((n) => (n.id === node.id ? { ...n, data: { ...n.data, execStatus: "running" as ExecStatus } } : n))
      );
      const msg = `Executing ${def.label} "${node.data.label}"…`;
      log.push(msg);
      setRunLog([...log]);
      await sleep(600 + Math.random() * 400);

      const success = Math.random() > 0.1;
      if (success) {
        setNodes((nds) =>
          nds.map((n) =>
            n.id === node.id
              ? { ...n, data: { ...n.data, execStatus: "completed" as ExecStatus, execResult: "ok" } }
              : n
          )
        );
        log.push(`  ✓ ${def.label} completed`);
      } else {
        setNodes((nds) =>
          nds.map((n) =>
            n.id === node.id
              ? { ...n, data: { ...n.data, execStatus: "failed" as ExecStatus, execResult: "error" } }
              : n
          )
        );
        log.push(`  ✗ ${def.label} failed`);
      }
      setRunLog([...log]);
    }

    log.push("Pipeline finished");
    setRunLog([...log]);
    toast.success("Pipeline execution completed");
    setIsRunning(false);
  }, [nodes, edges, setNodes]);

  const stopPipeline = useCallback(() => {
    setIsRunning(false);
    setNodes((nds) =>
      nds.map((n) =>
        n.data.execStatus === "running"
          ? { ...n, data: { ...n.data, execStatus: "failed" as ExecStatus, execResult: "stopped" } }
          : n
      )
    );
    toast.warning("Pipeline stopped");
  }, [setNodes]);

  /* ─── Keyboard shortcuts ────────────────────────────────────────────────── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        savePipeline();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        undo();
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedNode) {
          setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
          setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
          setSelectedNode(null);
          saveSnapshot();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [savePipeline, undo, selectedNode, setNodes, setEdges, saveSnapshot]);

  const nodeCount = nodes.length;
  const edgeCount = edges.length;

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-nexus-border bg-slate-950/60 px-4 py-2">
        <div className="flex items-center gap-2">
          <Input
            value={pipelineName}
            onChange={(e) => setPipelineName(e.target.value)}
            className="!w-56 !border-transparent !bg-transparent !px-1 !text-sm !font-semibold !text-slate-100 focus:!border-cyan-500/30"
          />
          <Badge tone="slate">{nodeCount} nodes</Badge>
          <Badge tone="slate">{edgeCount} edges</Badge>
        </div>
        <div className="flex items-center gap-1">
          <ToolbarButton onClick={savePipeline} disabled={isRunning} title="Save (Ctrl+S)">💾 Save</ToolbarButton>
          <div className="relative">
            <ToolbarButton disabled={isRunning} title="Load">📂 Load</ToolbarButton>
            <div className="group">
              <div className="absolute right-0 top-full z-50 hidden pt-1 group-hover:block">
                <LoadDropdown names={loadPipelineList()} onLoad={loadPipeline} />
              </div>
            </div>
          </div>
          {isRunning ? (
            <ToolbarButton onClick={stopPipeline} variant="danger" title="Stop">⏹ Stop</ToolbarButton>
          ) : (
            <ToolbarButton onClick={runPipeline} disabled={nodes.length === 0} variant="primary" title="Run Pipeline">▶ Run</ToolbarButton>
          )}
          <ToolbarButton onClick={exportPipeline} disabled={isRunning} title="Export">📤 Export</ToolbarButton>
          <ToolbarButton onClick={() => { setImportJson(""); setShowImport(true); }} disabled={isRunning} title="Import">📥 Import</ToolbarButton>
          <ToolbarButton onClick={undo} disabled={undoStack.length === 0 || isRunning} title="Undo (Ctrl+Z)">↩ Undo</ToolbarButton>
          <ToolbarButton onClick={clearPipeline} disabled={nodes.length === 0 || isRunning} title="Clear">🗑 Clear</ToolbarButton>
          <ToolbarButton onClick={() => setShowRunLog(!showRunLog)} title={showRunLog ? "Hide run log" : "Show run log"} aria-label={showRunLog ? "Hide run log" : "Show run log"} aria-pressed={showRunLog}>📋 Log</ToolbarButton>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Block palette sidebar */}
        <aside className="w-48 shrink-0 border-r border-nexus-border bg-slate-950/40 overflow-y-auto">
          <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Block Palette</div>
          <div className="space-y-1 px-2 pb-3">
            {BLOCK_REGISTRY.map((def) => (
              <div
                key={def.type}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/reactflow", def.type);
                  e.dataTransfer.effectAllowed = "move";
                }}
                className={cn(
                  "cursor-grab rounded-lg border px-3 py-2 text-xs transition-colors hover:brightness-125 active:cursor-grabbing",
                  BLOCK_PREVIEW_STYLES[def.type] ?? "border-slate-700 bg-slate-800/50"
                )}
              >
                <div className="flex items-center gap-2">
                  <span>{def.icon}</span>
                  <span className="font-medium text-slate-200">{def.label}</span>
                </div>
                <div className="mt-0.5 text-[10px] text-slate-500">{def.description}</div>
              </div>
            ))}
          </div>
        </aside>

        {/* React Flow canvas */}
        <div ref={reactFlowWrapper} className="flex-1" onDragOver={onDragOver} onDrop={onDrop}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onNodesDelete={onNodesDelete}
            nodeTypes={nodeTypes}
            defaultViewport={INITIAL_VIEWPORT}
            fitView
            deleteKeyCode="Delete"
            snapToGrid
            snapGrid={[16, 16]}
            minZoom={0.1}
            maxZoom={4}
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#1c2740" />
            <Controls className="!rounded-lg !border !border-nexus-border !bg-slate-900 !shadow-lg" />
            <MiniMap
              nodeStrokeColor="#06b6d4"
              nodeColor="#0c1322"
              nodeBorderRadius={8}
              maskColor="rgba(6,9,18,0.7)"
              className="!rounded-lg !border !border-nexus-border !shadow-lg"
            />
          </ReactFlow>
        </div>

        {/* Configuration panel */}
        <AnimatePresence>
          {selectedNode && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 288, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <ConfigPanel node={selectedNode} onUpdate={updateNodeConfig} onClose={() => setSelectedNode(null)} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Run log panel */}
      <AnimatePresence>
        {showRunLog && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 160, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-nexus-border bg-slate-950/80 overflow-y-auto"
          >
            <div className="flex items-center justify-between px-4 py-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Run Log</span>
              <button onClick={() => setShowRunLog(false)} className="text-xs text-slate-500 hover:text-slate-200">✕</button>
            </div>
            <div className="space-y-0.5 px-4 pb-2">
              {runLog.length === 0 && (
                <div className="py-4 text-center text-[11px] text-slate-600">No runs yet. Click ▶ Run to execute the pipeline.</div>
              )}
              {runLog.map((line, i) => (
                <div key={i} className={cn(
                  "font-mono text-[11px] leading-5",
                  line.startsWith("  ✓") ? "text-emerald-400" : line.startsWith("  ✗") ? "text-rose-400" : "text-slate-400"
                )}>
                  {line}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Import modal */}
      <Modal open={showImport} onClose={() => setShowImport(false)} title="Import Pipeline" wide>
        <div className="space-y-3">
          <Field label="Pipeline JSON">
            <Textarea rows={10} value={importJson} onChange={(e) => setImportJson(e.target.value)} className="font-mono text-[11px]" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowImport(false)}>Cancel</Button>
            <Button variant="primary" onClick={importPipeline}>Import</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ─── Topological sort ─────────────────────────────────────────────────────── */

function topoSort(nodes: PipelineNode[], edges: Edge[]): PipelineNode[] {
  const adj = new Map<string, string[]>();
  const inDeg = new Map<string, number>();
  for (const n of nodes) {
    adj.set(n.id, []);
    inDeg.set(n.id, 0);
  }
  for (const e of edges) {
    adj.get(e.source)?.push(e.target);
    inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
  }
  const q: string[] = [];
  for (const [id, deg] of inDeg) {
    if (deg === 0) q.push(id);
  }
  const result: PipelineNode[] = [];
  while (q.length > 0) {
    const id = q.shift()!;
    const node = nodes.find((n) => n.id === id);
    if (node) result.push(node);
    for (const neighbor of adj.get(id) ?? []) {
      const deg = (inDeg.get(neighbor) ?? 1) - 1;
      inDeg.set(neighbor, deg);
      if (deg === 0) q.push(neighbor);
    }
  }
  return result;
}

/* ─── Sleep helper ─────────────────────────────────────────────────────────── */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ─── Toolbar button ───────────────────────────────────────────────────────── */

function ToolbarButton({
  children,
  onClick,
  variant = "default",
  disabled,
  title, "aria-label": ariaLabel, "aria-pressed": ariaPressed,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "default" | "primary" | "danger";
  disabled?: boolean;
  title?: string; "aria-label"?: string; "aria-pressed"?: boolean;
}) {
  const vCls = variant === "primary"
    ? "bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 border-cyan-500/30"
    : variant === "danger"
    ? "bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border-rose-500/30"
    : "bg-transparent text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 border-transparent";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title} aria-label={ariaLabel} aria-pressed={ariaPressed}
      className={cn(
        "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
        vCls
      )}
    >
      {children}
    </button>
  );
}

/* ─── Load dropdown ────────────────────────────────────────────────────────── */

function LoadDropdown({ names, onLoad }: { names: string[]; onLoad: (name: string) => void }) {
  return (
    <Card className="max-h-48 w-48 overflow-y-auto p-1 shadow-xl">
      {names.length === 0 && (
        <div className="px-2 py-3 text-center text-[11px] text-slate-500">No saved pipelines</div>
      )}
      {names.map((name) => (
        <button
          key={name}
          onClick={() => onLoad(name)}
          className="w-full rounded-md px-2 py-1.5 text-left text-xs text-slate-300 hover:bg-slate-800"
        >
          {name}
        </button>
      ))}
    </Card>
  );
}

/* ─── Exported wrapper with ReactFlowProvider ──────────────────────────────── */

export default function PipelineBuilder() {
  return (
    <div className="h-full">
      <ReactFlowProvider>
        <PipelineBuilderInner />
      </ReactFlowProvider>
    </div>
  );
}
