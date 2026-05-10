import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  variant?: "text" | "icon" | "full";
}

export function Logo({ className, size = "md", variant = "full" }: LogoProps) {
  const sizeClasses = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-xl",
  };

  const iconSizeClasses = {
    sm: "h-6 w-6",
    md: "h-8 w-8",
    lg: "h-10 w-10",
  };

  const fontSizeClasses = {
    sm: "text-[11px]",
    md: "text-[14px]",
    lg: "text-[18px]",
  };

  const LogoIcon = ({ iconSize = "md" }: { iconSize?: "sm" | "md" | "lg" }) => (
    <svg
      className={cn(iconSizeClasses[iconSize], "text-brand")}
      viewBox="0 0 20 20"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="3" y="15" width="2" height="2" className="fill-current" />
      <rect x="3" y="13" width="2" height="2" className="fill-current" />
      <rect x="3" y="11" width="2" height="2" className="fill-current" />
      <rect x="3" y="9" width="2" height="2" className="fill-current" />
      <rect x="3" y="7" width="2" height="2" className="fill-current" />
      <rect x="3" y="5" width="2" height="2" className="fill-current" />
      <rect x="5" y="3" width="2" height="2" className="fill-current" />
      <rect x="7" y="3" width="2" height="2" className="fill-current" />
      <rect x="9" y="3" width="2" height="2" className="fill-current" />
      <rect x="11" y="5" width="2" height="2" className="fill-current" />
      <rect x="11" y="7" width="2" height="2" className="fill-current" />
      <rect x="11" y="15" width="2" height="2" className="fill-current" />
      <rect x="9" y="13" width="2" height="2" className="fill-current" />
      <rect x="13" y="13" width="2" height="2" className="fill-current" />
      <rect x="7" y="11" width="2" height="2" className="fill-current" />
      <rect x="15" y="11" width="2" height="2" className="fill-current" />
    </svg>
  );

  if (variant === "icon") {
    return (
      <div className={className}>
        <LogoIcon iconSize={size} />
      </div>
    );
  }

  if (variant === "text") {
    return (
      <span className={cn("inline-flex items-center gap-2", className)}>
        <LogoIcon iconSize={size} />
        <span className={cn("font-semibold tracking-tight", sizeClasses[size])}>Retuned</span>
      </span>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <LogoIcon iconSize={size} />
      <span className={cn("font-semibold tracking-tight", sizeClasses[size])}>Retuned</span>
    </div>
  );
}
