import logoImage from "@assets/WhatsApp Image 2025-11-15 at 06.14.52_1763208299445.jpeg";

interface DelfosLogoProps {
  variant?: "full" | "icon";
  className?: string;
}

export function DelfosLogo({ variant = "full", className = "" }: DelfosLogoProps) {
  if (variant === "icon") {
    return (
      <div className={`flex items-center justify-center ${className}`} data-testid="logo-icon">
        <img
          src={logoImage}
          alt="DELFOS"
          className="object-contain"
        />
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 ${className}`} data-testid="logo-full">
      <img
        src={logoImage}
        alt="DELFOS - Oracle of Trading"
        className="w-10 h-10 object-contain"
      />
      <div className="flex flex-col">
        <span className="text-lg font-bold tracking-tight text-foreground">
          DELFOS
        </span>
        <span className="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
          Oracle of Trading
        </span>
      </div>
    </div>
  );
}
