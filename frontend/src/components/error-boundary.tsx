import { Component, type ErrorInfo, type ReactNode } from 'react';

/** Contains a render error to one part of the page (e.g. a single dashboard widget). */
export class ErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Widget failed to render', error, info.componentStack);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
