import { Component } from 'react';
import { AlertTriangle } from 'lucide-react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Page error:', error, info);
  }

  resetError = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div className="page">
          <div className="card" style={{ borderLeft: '3px solid var(--red)', padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <AlertTriangle size={20} style={{ color: 'var(--red)' }} />
              <h3 style={{ fontSize: 16, fontWeight: 600 }}>Something went wrong on this page</h3>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, fontFamily: 'var(--font-mono)' }}>
              {this.state.error.message || String(this.state.error)}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={this.resetError}>Try again</button>
              <button className="btn btn-secondary" onClick={() => window.location.href = '/'}>Go to Dashboard</button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
