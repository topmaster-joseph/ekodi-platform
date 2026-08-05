import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SiteApp } from './SiteApp';
import './styles.css';

const root = document.querySelector<HTMLDivElement>('#root');
if (!root) throw new Error('EKODI application root was not found.');

createRoot(root).render(
  <StrictMode>
    <SiteApp />
  </StrictMode>
);
