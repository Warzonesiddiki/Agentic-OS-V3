$ErrorActionPreference = "Stop"
$path = "C:\Users\Tahir\OneDrive\Desktop\nexus-20-ai-agent-os (7)\Agentic OS V3\src\components\ui.tsx"
$c = [System.IO.File]::ReadAllText($path)

# Add hooks import after the ReactNode type import
$c = $c.Replace(
  'import type { ReactNode } from "react";',
  'import type { ReactNode } from "react";' + [Environment]::NewLine + 'import { useEffect, useId, useRef } from "react";'
)

$newModal = @"
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = (document.activeElement as HTMLElement) ?? null;
    const panel = panelRef.current;
    const getFocusable = () =>
      panel
        ? Array.from(
            panel.querySelectorAll<HTMLElement>(
              'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])'
            )
          ).filter((el) => el.offsetParent !== null)
        : [];
    const focusable = getFocusable();
    (focusable[0] ?? panel)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "Tab") {
        const nodes = getFocusable();
        if (nodes.length === 0) {
          e.preventDefault();
          panel?.focus();
          return;
        }
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn("nexus-fade relative z-10 max-h-[88vh] w-full overflow-auto rounded-xl border border-nexus-border bg-nexus-panel shadow-2xl outline-none", wide ? "max-w-3xl" : "max-w-lg")}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-nexus-border bg-nexus-panel/95 px-4 py-3 backdrop-blur">
          <h3 id={titleId} className="text-sm font-semibold text-slate-100">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-md px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >X</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
"@

# Normalize newlines to CRLF to match the file
$newModal = $newModal.Replace("`r`n", "`n").Replace("`r", "`n").Replace("`n", "`r`n")

# Replace the existing Modal function (ends with "  );\r\n}")
$c = [regex]::Replace($c, 'export function Modal\([\s\S]*?\r\n  \);\r\n\}', $newModal)

[System.IO.File]::WriteAllText($path, $c)
Write-Host "Modal updated."
