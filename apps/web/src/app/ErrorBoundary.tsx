import { Component, ErrorInfo, ReactNode } from 'react';

/**
 * Without this, any render error or failed lazy() chunk unmounts the whole
 * tree and leaves the black page background — indistinguishable from a
 * loading state, and unreadable on a device with no dev console.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[app] Unhandled error:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-dvh bg-void flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-14 text-paper uppercase tracking-[0.08em]">Something broke</p>
        <p className="text-13 text-fog font-mono break-all max-w-[480px]">{this.state.error.message}</p>
        <button
          onClick={() => window.location.reload()}
          className="text-12 text-fog uppercase tracking-[0.08em] underline p-2"
        >
          reload
        </button>
      </div>
    );
  }
}
