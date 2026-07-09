import { useMemo, useState } from 'react';
import { nexus, useNexus } from '../store';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  SectionTitle,
  Select,
  Tag,
  Textarea,
  cn,
} from '../components/ui';
import { timeAgo } from '../lib/core';
import { MEMORY_KINDS, type Memory, type MemoryInput } from '../lib/types';
import { DataList } from '../components/DataList';
import { SectionErrorBoundary } from '../components/SectionErrorBoundary';

const KIND_TONE: Record<string, 'violet' | 'cyan' | 'emerald' | 'amber' | 'rose'> = {
  episodic: 'violet',
  semantic: 'cyan',
  preference: 'amber',
  reflexion: 'emerald',
  fact: 'rose',
};

const empty: MemoryInput = {
  kind: 'semantic',
  title: '',
  content: '',
  tags: [],
  importance: 0.5,
  source: 'manual',
  projectId: null,
};

export default function Memories() {
  const s = useNexus();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [tag, setTag] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Memory | null>(null);
  const [form, setForm] = useState<MemoryInput>(empty);
  const [tagsText, setTagsText] = useState('');

  const allTags = useMemo(
    () => Array.from(new Set(s.memories.flatMap((m) => m.tags))).sort(),
    [s.memories]
  );

  const filtered = s.memories.filter((m) => {
    if (kind && m.kind !== kind) return false;
    if (tag && !m.tags.includes(tag)) return false;
    if (q && !(m.title + m.content).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  function openNew() {
    setEditing(null);
    setForm(empty);
    setTagsText('');
    setOpen(true);
  }
  function openEdit(m: Memory) {
    setEditing(m);
    setForm({
      kind: m.kind,
      title: m.title,
      content: m.content,
      tags: m.tags,
      importance: m.importance,
      source: m.source,
      projectId: m.projectId,
    });
    setTagsText(m.tags.join(', '));
    setOpen(true);
  }
  function save() {
    const input = {
      ...form,
      tags: tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    };
    if (editing) nexus.updateMemory(editing.id, input);
    else nexus.createMemory(input);
    setOpen(false);
  }

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Memories"
        subtitle="Durable, typed, semantically recallable knowledge"
        action={
          <Button variant="primary" onClick={openNew}>
            + New memory
          </Button>
        }
      />

      <SectionErrorBoundary sectionName="Memories">
      <DataList
        items={s.memories}
        filteredItems={filtered}
        searchQuery={q}
        onSearchChange={setQ}
        searchPlaceholder="Search memories…"
        filters={[
          {
            value: kind,
            onChange: setKind,
            placeholder: 'All kinds',
            options: MEMORY_KINDS.map((k) => ({ label: k, value: k })),
          },
          {
            value: tag,
            onChange: setTag,
            placeholder: 'All tags',
            options: allTags.map((t) => ({ label: `#${t}`, value: t })),
          },
        ]}
        emptyStateTitle="No memories match"
        emptyStateHint="Adjust filters or create a new memory."
        renderItem={(m: Memory) => (
          <Card key={m.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge tone={KIND_TONE[m.kind]}>{m.kind}</Badge>
                  <h3 className="truncate text-sm font-semibold text-slate-100">{m.title}</h3>
                </div>
                <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-400">
                  {m.content}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="sm" variant="ghost" onClick={() => openEdit(m)}>
                  edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-rose-400 hover:bg-rose-500/10"
                  onClick={() => nexus.deleteMemory(m.id)}
                >
                  del
                </Button>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                <div
                  className={cn(
                    'h-full rounded-full',
                    m.importance > 0.66
                      ? 'bg-emerald-400'
                      : m.importance > 0.33
                        ? 'bg-amber-400'
                        : 'bg-slate-500'
                  )}
                  style={{ width: `${m.importance * 100}%` }}
                />
              </div>
              <span className="font-mono text-[10px] text-slate-500">
                imp {m.importance.toFixed(2)}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {m.tags.map((t) => (
                <Tag key={t}>{t}</Tag>
              ))}
              <span className="ml-auto font-mono text-[10px] text-slate-600">
                recalled {m.recallCount}× · {timeAgo(m.updatedAt)}
              </span>
            </div>
          </Card>
        )}
      />
      </SectionErrorBoundary>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Edit memory' : 'New memory'}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kind">
              <Select
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value as MemoryInput['kind'] })}
              >
                {MEMORY_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Source">
              <Input
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Title">
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="A concise title"
            />
          </Field>
          <Field label="Content">
            <Textarea
              rows={5}
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder="The full memory content…"
            />
          </Field>
          <Field label="Tags" hint="comma separated">
            <Input
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="typescript, security"
            />
          </Field>
          <Field label={`Importance · ${form.importance.toFixed(2)}`}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={form.importance}
              onChange={(e) => setForm({ ...form, importance: Number(e.target.value) })}
              className="w-full accent-cyan-500"
            />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} disabled={!form.title || !form.content}>
              Save memory
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
