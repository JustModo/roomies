import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

document.getElementById('unsupported-browser')?.remove();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
