/**
 * 最外層錯誤邊界：畫面元件拋錯時顯示錯誤畫面，不留白畫面。
 */
import { Component, type ComponentChildren } from 'preact';
import { ErrorPage } from '../pages/boot';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ComponentChildren }, State> {
  override state: State = { error: null };

  static override getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: unknown): void {
    console.error('畫面發生錯誤', error);
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <ErrorPage
          error={{ code: 'unexpected', message: error.message }}
          onReload={() => window.location.reload()}
        />
      );
    }
    return this.props.children;
  }
}
