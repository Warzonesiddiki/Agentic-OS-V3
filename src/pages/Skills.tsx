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
} from '../components/ui';
import type { Skill, SkillInput } from '../lib/types';
import { DataList } from '../components/DataList';

const empty: SkillInput = {
  name: '',
  title: '',
  description: '',
  content: '',
  category: 'general',
  tags: [],
  trigger: null,
  source: 'manual',
  projectId: null,
};

export default function Skills() {
  const s = useNexus();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Skill | null>(null);
  const [form, setForm] = useState<SkillInput>(empty);
  const [tagsText, setTagsText] = useState('');

  const cats = useMemo(
    () => Array.from(new Set(s.skills.map((k) => k.category))).sort(),
    [s.skills]
  );
  const filtered = s.skills.filter((k) => {
    if (cat && k.category !== cat) return false;
    if (q && !(k.title + k.description + k.name).toLowerCase().includes(q.toLowerCase()))
      return false;
    return true;
  });

  function openNew() {
    setEditing(null);
    setForm(empty);
    setTagsText('');
    setOpen(true);
  }
  function openEdit(k: Skill) {
    setEditing(k);
    setForm({
      name: k.name,
      title: k.title,
      description: k.description,
      content: k.content,
      category: k.category,
      tags: k.tags,
      trigger: k.trigger,
      source: k.source,
      projectId: k.projectId,
    });
    setTagsText(k.tags.join(', '));
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
    if (editing) nexus.updateSkill(editing.id, input);
    else nexus.createSkill(input);
    setOpen(false);
  }

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Skills library"
        subtitle="Reusable procedures with outcome-tracked ratings"
        action={
          <Button variant="primary" onClick={openNew}>
            + New skill
          </Button>
        }
      />

      <DataList
        items={s.skills}
        filteredItems={filtered}
        searchQuery={q}
        onSearchChange={setQ}
        searchPlaceholder="Search skills…"
        filters={[
          {
            value: cat,
            onChange: setCat,
            placeholder: 'All categories',
            options: cats.map((c) => ({ label: c, value: c })),
          },
        ]}
        emptyStateTitle="No skills"
        emptyStateHint="Create a reusable procedure."
        renderItem={(k: Skill) => (
          <Card key={k.id} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge tone="cyan">{k.category}</Badge>
                  <h3 className="truncate text-sm font-semibold text-slate-100">{k.title}</h3>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-slate-400">{k.description}</p>
                <code className="mt-1 inline-block font-mono text-[10px] text-slate-600">
                  {k.name}
                </code>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="sm" variant="ghost" onClick={() => openEdit(k)}>
                  edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-rose-400 hover:bg-rose-500/10"
                  onClick={() => nexus.deleteSkill(k.id)}
                >
                  del
                </Button>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-cyan-400"
                  style={{ width: `${k.rating * 100}%` }}
                />
              </div>
              <span className="font-mono text-[10px] text-slate-500">
                rating {Math.round(k.rating * 100)}%
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1">
              {k.tags.map((t) => (
                <Tag key={t}>{t}</Tag>
              ))}
              <span className="ml-auto font-mono text-[10px] text-slate-600">
                used {k.useCount}× · {k.successCount}✓ {k.failureCount}✗
              </span>
            </div>

            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
                onClick={() => nexus.recordOutcome(k.id, 'success')}
              >
                ✓ Worked
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 border-rose-500/40 text-rose-300 hover:bg-rose-500/10"
                onClick={() => nexus.recordOutcome(k.id, 'failure')}
              >
                ✗ Failed
              </Button>
            </div>
          </Card>
        )}
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Edit skill' : 'New skill'}
        wide
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" hint="lowercase-kebab">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="font-mono"
                placeholder="deploy-with-docker"
              />
            </Field>
            <Field label="Category">
              <Input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Title">
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>
          <Field label="Description">
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
          <Field label="Content / steps">
            <Textarea
              rows={6}
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Trigger" hint="optional">
              <Input
                value={form.trigger ?? ''}
                onChange={(e) => setForm({ ...form, trigger: e.target.value || null })}
              />
            </Field>
            <Field label="Tags" hint="comma separated">
              <Input value={tagsText} onChange={(e) => setTagsText(e.target.value)} />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={save}
              disabled={!form.name || !form.title || !form.content}
            >
              Save skill
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
