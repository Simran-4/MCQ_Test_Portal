import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import "./styles/quiz.css";
import "./styles/responsive.css";
import App from './App.jsx'
import "./i18n";

const mountApp = () => {
  const rootElement = document.getElementById('root');

  if (!rootElement) {
    console.error('Unable to start MCQ Test Portal: #root element was not found.');
    return;
  }

  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountApp, { once: true });
} else {
  mountApp();
}
