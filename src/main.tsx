import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/500.css';
import '@fontsource/be-vietnam-pro/600.css';
import '@fontsource/be-vietnam-pro/700.css';
import '@fontsource/be-vietnam-pro/800.css';
import '@fontsource/be-vietnam-pro/900.css';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {waitForGameFonts} from './utils/fontLoader.ts';

void waitForGameFonts(4000).finally(() => {
  createRoot(document.getElementById('root')!).render(<App />);
});
