import { cn } from "@/lib/utils";

/**
 * AEGIS mark (2D): shield with an "A", circled by a tilted orbit ring.
 * Same geometry as the 3D logo on the sign-in screen.
 */
export function LogoMark({ className, title = "AEGIS" }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("h-8 w-8", className)} role="img" aria-label={title}>
      <defs>
        <linearGradient id="aegis-shield" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="hsl(var(--primary))" />
          <stop offset="1" stopColor="hsl(var(--primary) / 0.78)" />
        </linearGradient>
      </defs>
      <ellipse cx="32" cy="33" rx="29" ry="10" fill="none" stroke="hsl(var(--foreground) / 0.35)" strokeWidth="2" transform="rotate(-18 32 33)" />
      <path
        d="M32 7c6 2.6 11.6 3.9 17 4.1.3 13.6-3.3 26.8-17 34.9C18.3 37.9 14.7 24.7 15 11.1 20.4 10.9 26 9.6 32 7Z"
        fill="url(#aegis-shield)"
      />
      <path d="M26.4 35.5 31 18.5h2l4.6 17h-3.6l-1-4h-2l-1 4h-3.6Zm5-7.2h1.2L32 25.4l-.6 2.9Z" fill="hsl(var(--primary-foreground))" />
      <path d="M8.6 39.2C13 44 21.8 47 32 47c10.4 0 19.4-3.1 23.6-8.1" fill="none" stroke="hsl(var(--foreground) / 0.55)" strokeWidth="2" strokeLinecap="round" transform="rotate(-18 32 33)" />
      <circle cx="56" cy="27" r="2.6" fill="hsl(var(--primary))" />
    </svg>
  );
}

export function Logo({ className, showTagline }: { className?: string; showTagline?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      <div className="min-w-0">
        <div className="font-semibold leading-none tracking-tight" dir="ltr">AEGIS</div>
        {showTagline && <div className="mt-1 truncate text-[11px] text-muted-foreground">{showTagline}</div>}
      </div>
    </div>
  );
}
