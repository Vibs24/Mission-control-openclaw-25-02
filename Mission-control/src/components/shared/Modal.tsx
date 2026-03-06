import { cn } from "../../lib/utils";
import type { ReactNode } from "react";

interface PanelProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  width?: string;
}

export function Panel({ title, onClose, children, className, width = "w-[440px]" }: PanelProps) {
  return (
    <div
      className={cn(
        "flex flex-col h-full border-l border-gray-200 bg-white overflow-hidden",
        width,
        className
      )}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
            {title}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-lg leading-none"
        >
          ×
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
