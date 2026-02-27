import { cn } from "../../lib/utils";

interface StatusDotProps {
  color?: string;
  size?: "sm" | "md";
  className?: string;
}

export function StatusDot({ color = "bg-gray-400", size = "sm", className }: StatusDotProps) {
  return (
    <span
      className={cn(
        "inline-block rounded-full flex-shrink-0",
        size === "sm" ? "w-2 h-2" : "w-2.5 h-2.5",
        color,
        className
      )}
    />
  );
}
