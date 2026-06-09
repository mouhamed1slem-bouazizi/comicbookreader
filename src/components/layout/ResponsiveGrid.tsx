import { cn } from "@/lib/utils";

interface ResponsiveGridProps {
  children: React.ReactNode;
  className?: string;
}

export function ResponsiveGrid({ children, className }: ResponsiveGridProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
        className
      )}
    >
      {children}
    </div>
  );
}
