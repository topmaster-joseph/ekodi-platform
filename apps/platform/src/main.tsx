import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

function PlatformRuntime() {
  useEffect(() => {
    void import('./legacy-console');
  }, []);
  return <span className="sr-only" aria-live="polite">EKODI React 관리 콘솔</span>;
}

const runtime = document.querySelector<HTMLDivElement>('#react-runtime');
if (!runtime) throw new Error('EKODI React runtime root was not found.');
createRoot(runtime).render(<StrictMode><PlatformRuntime /></StrictMode>);
