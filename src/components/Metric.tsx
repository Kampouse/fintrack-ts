interface Props {
  label: string;
  value: string;
  color?: string;
}

export function Metric({ label, value, color }: Props) {
  return (
    <div>
      <div style={{ fontSize: "12px", color: "var(--text-dim)", marginBottom: "2px" }}>{label}</div>
      <div style={{ fontSize: "15px", fontWeight: 500, color: color ?? "var(--text)" }}>{value}</div>
    </div>
  );
}
