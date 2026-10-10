import { ImageResponse } from "next/og";

export const alt = "EngCalcs — Connected engineering calculations";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%", height: "100%", background: "#f6f4ed",
        display: "flex", flexDirection: "column", position: "relative",
        padding: "55px 70px", color: "#19382f", fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 19 }}>
        <svg width="65" height="65" viewBox="0 0 48 48">
          <rect width="48" height="48" rx="5" fill="#19382f" />
          <path d="M35 10H23L12 20V28L23 38H35" fill="none" stroke="#f6f4ed" strokeWidth="4" />
          <path d="M30 16H21V32H30M21 24H29" fill="none" stroke="#d5ac71" strokeWidth="3" />
        </svg>
        <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: -1.5 }}>EngCalcs</span>
      </div>
      <div style={{ marginTop: 45, display: "flex", flexDirection: "column", maxWidth: 900 }}>
        <span style={{ fontSize: 16, letterSpacing: 3, fontWeight: 700, color: "#60796a" }}>
          ENGINEERING SOFTWARE / AUSTRALIA
        </span>
        <span style={{ marginTop: 18, fontSize: 72, fontWeight: 700, lineHeight: 1.06, letterSpacing: -3 }}>
          Engineering calculations,
        </span>
        <span style={{ marginTop: 3, fontSize: 72, fontWeight: 700, lineHeight: 1.06, letterSpacing: -3, color: "#3f775a" }}>
          connected to the project.
        </span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "auto", paddingTop: 26, borderTop: "2px solid #cad6cb", alignItems: "center" }}>
        <span style={{ fontSize: 21, color: "#405d4d" }}>Deterministic engines. Reviewable results. AI coordination in development.</span>
        <span style={{ fontSize: 20, fontWeight: 700, color: "#8f5b3f" }}>engcalcs.au</span>
      </div>
      <svg
        width="170" height="170" viewBox="0 0 170 170"
        style={{ position: "absolute", top: 30, right: 65, opacity: .15 }}
      >
        <path d="M10 145H150M30 125V20H125M45 110H135M30 70H110M110 70V145" stroke="#285f49" strokeWidth="2" fill="none" />
        <circle cx="30" cy="70" r="5" fill="#bc7652" />
        <circle cx="110" cy="70" r="5" fill="#bc7652" />
        <circle cx="110" cy="145" r="5" fill="#bc7652" />
      </svg>
    </div>,
    { ...size },
  );
}
