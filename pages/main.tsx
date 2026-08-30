import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { AtlasApp } from '@/components/atlas/atlas-app';
import '@/app/globals.css';

const root = document.getElementById('root');

if (!root) throw new Error('Atlas root element is missing.');

createRoot(root).render(
  <StrictMode>
    <AtlasApp />
  </StrictMode>,
);
