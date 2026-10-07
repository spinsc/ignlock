import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './driver.css';
import DriverApp from './DriverApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DriverApp />
  </StrictMode>,
);
