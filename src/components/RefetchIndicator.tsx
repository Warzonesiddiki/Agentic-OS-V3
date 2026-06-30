/**
 * RefetchIndicator — thin animated progress bar that shows during background
 * refetches. Renders nothing when not refetching.
 */
export function RefetchIndicator({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[40] h-0.5">
      <div className="h-full animate-pulse bg-gradient-to-r from-cyan-500/0 via-cyan-500/60 to-cyan-500/0" />
    </div>
  );
}
