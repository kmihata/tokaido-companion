import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Desk } from './Desk';
import '../styles.css';
import './desk.css';

// No service worker here on purpose: the desk is a networked, sighted-at-a-
// keyboard tool, and precaching it would put the editing surface on the phone,
// which is exactly what this split exists to prevent.
const root = document.getElementById('desk');
if (!root) throw new Error('#desk is missing from desk.html.');

createRoot(root).render(
  <StrictMode>
    <Desk />
  </StrictMode>,
);
