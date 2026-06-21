interface Props {
  count?: number;
}

export function SkeletonCard({ count = 3 }: Props) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            padding: "14px 16px",
            borderTop: i === 0 ? "none" : "1px solid var(--card-border)",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <div className="skeleton" style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="skeleton" style={{ width: "40%", height: 16, marginBottom: 6 }} />
            <div className="skeleton" style={{ width: "60%", height: 12 }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <div className="skeleton" style={{ width: 64, height: 24 }} />
            <div className="skeleton" style={{ width: 48, height: 12 }} />
          </div>
        </div>
      ))}
    </>
  );
}
