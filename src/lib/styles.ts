import type { CSSProperties } from "react";

export const theme = {
  bg: "#0a0a0a",
  card: "rgba(255,255,255,0.04)",
  cardBorder: "rgba(255,255,255,0.08)",
  lime: "#bef264",
  limeDim: "rgba(190,242,100,0.12)",
  text: "rgba(255,255,255,0.95)",
  textDim: "rgba(255,255,255,0.5)",
  red: "#f87171",
  green: "#4ade80",
} as const;

export const card: CSSProperties = {
  background: theme.card,
  border: `1px solid ${theme.cardBorder}`,
  borderRadius: "16px",
  padding: "16px",
};

export const btnIcon: CSSProperties = {
  width: "40px",
  height: "40px",
  borderRadius: "12px",
  border: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  background: "transparent",
  flexShrink: 0,
};

export const input: CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: "12px",
  border: `1px solid ${theme.cardBorder}`,
  background: "rgba(0,0,0,0.3)",
  color: theme.text,
  fontSize: "15px",
  outline: "none",
  boxSizing: "border-box" as const,
};

export const inputCss = `
input::placeholder { color: rgba(255,255,255,0.3); }
input:focus { border-color: var(--lime); }
input[type=number]::-webkit-inner-spin-button,
input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
input[type=number] { -moz-appearance: textfield; }
`;
