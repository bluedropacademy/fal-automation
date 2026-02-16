"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

interface CollapsibleSectionProps {
  title: string;
  icon?: ReactNode;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function CollapsibleSection({
  title,
  icon,
  badge,
  defaultOpen = true,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-border/80 bg-card shadow-[var(--shadow-card)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-3.5 text-start hover:bg-muted/30 transition-colors rounded-t-xl"
      >
        <div className="flex items-center gap-2">
          {icon && <span className="flex items-center justify-center h-6 w-6 rounded-md bg-primary/10 text-primary">{icon}</span>}
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {!open && badge && (
            <span className="text-xs text-muted-foreground">{badge}</span>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="border-t border-border/60 px-5 py-4 animate-fade-in">{children}</div>
        </div>
      </div>
    </div>
  );
}
