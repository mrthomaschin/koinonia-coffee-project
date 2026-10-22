import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import trackingService from './services/trackingService';

// Initialize before the first render so the landing page view isn't dropped.
trackingService.initialize();

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
