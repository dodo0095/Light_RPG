import { render } from 'preact';

// G1 前不做 UI 設計，只放佔位畫面。
function App() {
  return <h1>晨光之誓</h1>;
}

const root = document.getElementById('app');
if (root) {
  render(<App />, root);
}
