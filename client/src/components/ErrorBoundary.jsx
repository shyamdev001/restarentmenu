import { Component } from 'react';

/** If something on the page breaks, say so and offer a way back, instead of a blank screen. */
export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(error) { console.error(error); }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="boot">
        <div>
          Something went wrong on this page.<br />Your order is safe.
          <p><button className="boot__retry" onClick={() => window.location.reload()}>Reload the page</button></p>
        </div>
      </div>
    );
  }
}
