import React from "react";

type ErrorBoundaryProps = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught error:", error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div
          role="alert"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            padding: 32,
            textAlign: "center",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ marginBottom: 16, opacity: 0.7 }}>
            An unexpected error occurred. Try reloading the app.
          </p>
          {this.state.error && (
            <pre
              style={{
                fontSize: 12,
                opacity: 0.5,
                maxWidth: 500,
                overflow: "auto",
                marginBottom: 16,
              }}
            >
              {this.state.error.message}
            </pre>
          )}
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              padding: "8px 20px",
              borderRadius: 6,
              border: "1px solid currentColor",
              background: "transparent",
              color: "inherit",
              cursor: "pointer",
              fontSize: 14,
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
