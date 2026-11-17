import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Erreur inattendue',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Application ErrorBoundary caught:', error, info);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    let parsedSummary = this.state.message;
    try {
      const parsed = JSON.parse(this.state.message) as { error?: string; operationType?: string };
      if (parsed && typeof parsed.error === 'string') {
        parsedSummary = `${parsed.operationType ? `[${parsed.operationType}] ` : ''}${parsed.error}`;
      }
    } catch {
      // Plain error message
    }

    return (
      <div className="min-h-screen bg-[#F6F5F0] text-[#18181B] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-[#E5E2D9] rounded-2xl p-6 space-y-4 shadow-sm">
          <h1 className="font-display text-lg font-semibold text-[#18181B]">
            Une interruption est survenue
          </h1>
          <p className="text-sm text-[#52525B] leading-relaxed">
            Vos brouillons, titres et épisodes restent conservés localement sur cet appareil.
          </p>
          {parsedSummary && (
            <p className="text-xs font-mono text-[#991B1B] bg-[#FEF2F2] border border-[#FECACA] rounded-lg p-3 break-words">
              {parsedSummary}
            </p>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, message: '' })}
              className="px-4 py-2 text-xs font-medium text-white bg-[#18181B] hover:bg-[#27272A] rounded-lg cursor-pointer"
            >
              Reprendre sans perdre mes données
            </button>
          </div>
        </div>
      </div>
    );
  }
}
