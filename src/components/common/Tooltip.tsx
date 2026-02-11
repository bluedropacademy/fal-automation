"use client";

import type { ReactNode } from "react";

interface TooltipProps {
  content: string;
  children: ReactNode;
}

export function Tooltip({ content, children }: TooltipProps) {
  return (
    <span className="group/tooltip relative inline-flex">
      {children}
      <span className="pointer-events-none absolute bottom-full right-1/2 translate-x-1/2 mb-2 w-max max-w-[200px] rounded-lg bg-foreground px-3 py-2 text-xs text-primary-foreground opacity-0 shadow-lg transition-opacity duration-150 group-hover/tooltip:opacity-100 z-50 text-center leading-relaxed">
        {content}
        <span className="absolute top-full right-1/2 translate-x-1/2 border-4 border-transparent border-t-foreground" />
      </span>
    </span>
  );
}
