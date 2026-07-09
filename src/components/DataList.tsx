import type { ReactNode } from 'react';
import { Card, EmptyState, Input, Select } from './ui';

interface FilterOption {
  label: string;
  value: string;
}

interface FilterDef {
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  options: FilterOption[];
}

interface DataListProps<T> {
  items: T[];
  filteredItems: T[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchPlaceholder?: string;
  filters?: FilterDef[];
  emptyStateTitle: string;
  emptyStateHint: string;
  renderItem: (item: T) => ReactNode;
}

export function DataList<T>({
  items,
  filteredItems,
  searchQuery,
  onSearchChange,
  searchPlaceholder = 'Search…',
  filters = [],
  emptyStateTitle,
  emptyStateHint,
  renderItem,
}: DataListProps<T>) {
  return (
    <div className="space-y-4">
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2" role="search">
          <Input
            type="search"
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="max-w-xs"
            aria-label={searchPlaceholder}
          />
          {filters.map((f, i) => (
            <Select
              key={i}
              value={f.value}
              onChange={(e) => f.onChange(e.target.value)}
              className="w-44"
              aria-label={f.placeholder}
            >
              <option value="">{f.placeholder}</option>
              {f.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          ))}
          <span className="ml-auto text-xs text-slate-500" role="status" aria-live="polite">
            {filteredItems.length} of {items.length}
          </span>
        </div>
      </Card>

      {filteredItems.length === 0 ? (
        <EmptyState title={emptyStateTitle} hint={emptyStateHint} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2" role="list" aria-label={searchPlaceholder}>
          {filteredItems.map((item) => (
            <div role="listitem" key={(item as { id?: string | number })?.id}>
              {renderItem(item)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
