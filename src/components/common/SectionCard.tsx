"use client";

import type { ReactNode } from "react";

interface SectionCardProps {
  title?: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  headerAction?: ReactNode;
  noPadding?: boolean;
}

export function SectionCard({
  title,
  subtitle,
  icon,
  children,
  className,
  headerAction,
  noPadding,
}: SectionCardProps) {
  return (
    <div
      className={`rounded-xl border border-border/80 bg-card shadow-[var(--shadow-card)] ${className ?? ""}`}
    >
      {title && (
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-3.5">
          <div className="flex items-center gap-2">
            {icon && (
              <span className="flex items-center justify-center h-6 w-6 rounded-md bg-primary/10 text-primary">{icon}</span>
            )}
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                {title}
              </h3>
              {subtitle && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          {headerAction}
        </div>
      )}
      <div className={noPadding ? "" : "p-5"}>{children}</div>
    </div>
  );
}
