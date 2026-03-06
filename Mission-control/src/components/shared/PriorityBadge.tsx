import { cn, getPriorityStyles } from "../../lib/utils";
import type { TaskPriority } from "../../types";

interface PriorityBadgeProps {
  priority: TaskPriority;
  className?: string;
}

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  const styles = getPriorityStyles(priority);
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase",
        styles.bg,
        styles.text,
        className
      )}
    >
      {styles.label}
    </span>
  );
}
