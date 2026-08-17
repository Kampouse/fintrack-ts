import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          minHeight: "100vh", padding: 24, color: "var(--text-dim)", background: "var(--bg)",
        }}>
          <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.3 }}>&#x26A0;</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Something went wrong</div>
          <div style={{ fontSize: 12, fontFamily: "ui-monospace, monospace", opacity: 0.5, marginBottom: 16, textAlign: "center", maxWidth: 400 }}>
            {this.state.error?.message}
          </div>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
            style={{
              padding: "8px 16px", borderRadius: 6, border: "1px solid var(--card-border)",
              background: "transparent", color: "var(--text)", fontSize: 12,
              fontFamily: "ui-monospace, monospace", cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
