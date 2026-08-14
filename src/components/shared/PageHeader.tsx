import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, action, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col md:flex-row md:items-center justify-between mb-6 pb-6 border-b gap-4", className)}>
      <div className="flex items-start gap-3">
        <div className="w-1 self-stretch rounded-full bg-primary shrink-0 hidden sm:block" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h1>
          {description && (
            <p className="text-muted-foreground mt-1.5 text-[15px] leading-relaxed">{description}</p>
          )}
        </div>
      </div>
      {action && (
        <div className="flex shrink-0">
          {action}
        </div>
      )}
    </div>
  );
}
