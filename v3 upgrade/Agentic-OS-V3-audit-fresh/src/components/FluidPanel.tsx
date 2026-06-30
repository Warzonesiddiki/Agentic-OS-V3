import type { ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "./ui";

interface FluidPanelProps {
  children: ReactNode;
  className?: string;
  open?: boolean;
  variant?: "glass" | "default";
}

export function FluidPanel({ children, className, open = true, variant = "glass" }: FluidPanelProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            variant === "glass" && "rounded-xl border border-nexus-border bg-nexus-panel/70 backdrop-blur-sm",
            className,
          )}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface FluidSectionProps {
  children: ReactNode;
  className?: string;
}

export function FluidSection({ children, className }: FluidSectionProps) {
  return (
    <FluidPanel className={cn("overflow-hidden", className)}>
      <motion.div layout className="divide-y divide-nexus-border/50">
        {children}
      </motion.div>
    </FluidPanel>
  );
}

interface FluidCardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
}

export function FluidCard({ children, className, onClick, hoverable }: FluidCardProps) {
  return (
    <motion.div
      whileHover={hoverable ? { scale: 1.01, y: -1 } : undefined}
      whileTap={onClick ? { scale: 0.99 } : undefined}
      onClick={onClick}
      className={cn(
        "rounded-lg border border-nexus-border/60 bg-slate-950/40 p-4 transition-colors",
        hoverable && "cursor-pointer hover:border-cyan-500/30",
        className,
      )}
    >
      {children}
    </motion.div>
  );
}
