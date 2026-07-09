import type { ReactNode } from 'react';
import { Card, EmptyState, Input, Select } from './ui';
import { SkeletonLoader } from './SkeletonLoader';

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
  /** Render skeleton placeholders while data is loading. When true, `filteredItems` is ignored. */
  loading?: boolean;
  /** Number of skeleton cards to render while loading (default 4) */
  skeletonCount?: number;
  /** Custom class for the results grid (defaults to a 2-column responsive grid) */
  gridClassName?: string;
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
  loading = false,
  skeletonCount = 4,
  gridClassName,
}: DataListProps<T>) {
  const gridClass = gridClassName ?? 'grid gap-3 md:grid-cols-2';
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
            disabled={loading}
          />
          {filters.map((f, i) => (
            <Select
              key={i}
              value={f.value}
              onChange={(e) => f.onChange(e.target.value)}
              className="w-44"
              aria-label={f.placeholder}
              disabled={loading}
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
            {loading ? 'Loading…' : `${filteredItems.length} of ${items.length}`}
          </span>
        </div>
      </Card>

      {loading ? (
        <div className={gridClass} role="status" aria-busy="true" aria-label={`Loading ${searchPlaceholder}`}>
          {Array.from({ length: skeletonCount }).map((_, i) => (
            <Card key={i} className="p-4">
              <SkeletonLoader lines={3} />
            </Card>
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <EmptyState title={emptyStateTitle} hint={emptyStateHint} />
      ) : (
        <div className={gridClass} role="list" aria-label={searchPlaceholder}>
          {filteredItems.map((item, i) => {
            const id = (item as { id?: string | number })?.id;
            const key = id !== undefined && id !== null ? id : i;
            return (
              <div role="listitem" key={key}>
                {renderItem(item)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
