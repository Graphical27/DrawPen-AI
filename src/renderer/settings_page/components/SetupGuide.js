import React, { useState } from 'react';
import './Settings.scss'; // Re-use settings styles where possible, but we'll add specific ones too

const SetupGuide = ({ isOpen, onSave, onClose }) => {
  const [apiKey, setApiKey] = useState('');

  if (!isOpen) return null;

  const handleSave = () => {
    if (apiKey.trim()) {
      onSave(apiKey);
    }
  };

  return (
    <div className="setup-guide-overlay">
      <div className="setup-guide-modal">
        <div className="setup-guide-header">
          <h2>Welcome to DrawPen AI!</h2>
          <p>Let's get you set up with AI features.</p>
        </div>

        <div className="setup-guide-content">
          <div className="step">
            <div className="step-number">1</div>
            <div className="step-text">
              <p>To use the AI drawing features, you need a Google Gemini API Key.</p>
              <a 
                href="https://aistudio.google.com/app/apikey" 
                target="_blank" 
                rel="noreferrer"
                className="get-key-link"
              >
                Get your free API Key here &rarr;
              </a>
            </div>
          </div>

          <div className="step">
            <div className="step-number">2</div>
            <div className="step-text">
              <p>Paste your API Key below:</p>
              <input
                type="password"
                className="api-key-input"
                placeholder="Paste API Key here..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="setup-guide-footer">
          <button className="button button-secondary" onClick={onClose}>Skip for now</button>
          <button 
            className="button button-primary" 
            onClick={handleSave}
            disabled={!apiKey.trim()}
          >
            Save & Start
          </button>
        </div>
      </div>
    </div>
  );
};

export default SetupGuide;
