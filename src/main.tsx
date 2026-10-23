import { render } from 'preact';
import { UpdatePrompt } from './ui/components/update-prompt';

// G1 前不做 UI 設計，只放佔位畫面＋版本號（用來確認更新是否生效）。
function App() {
  return (
    <>
      <h1>晨光之誓</h1>
      <p>版本 {__APP_VERSION__}</p>
      <UpdatePrompt />
    </>
  );
}

const root = document.getElementById('app');
if (root) {
  render(<App />, root);
}
