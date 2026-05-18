import type { ThemeTokens } from "../adminTheme";

export function Skeleton({ tokens, width = "100%", height = 16, radius = 6 }: {
  tokens: ThemeTokens; width?: number | string; height?: number; radius?: number;
}) {
  return (
    <div
      style={{
        width, height, borderRadius: radius,
        background: `linear-gradient(90deg, ${tokens.bgElev2} 0%, ${tokens.bgHover} 50%, ${tokens.bgElev2} 100%)`,
        backgroundSize: "200% 100%",
        animation: "skel 1.4s ease-in-out infinite",
      }}
    />
  );
}

export function SkeletonGrid({ tokens, rows = 8, cols = 5 }: { tokens: ThemeTokens; rows?: number; cols?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12 }}>
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} tokens={tokens} height={14} />
          ))}
        </div>
      ))}
    </div>
  );
}

// Inyectar keyframe en el documento si no existe
if (typeof document !== "undefined" && !document.getElementById("skel-keyframes")) {
  const style = document.createElement("style");
  style.id = "skel-keyframes";
  style.textContent = `@keyframes skel { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`;
  document.head.appendChild(style);
}
