import React, { useState, useEffect, useRef } from 'react';
import './AIDialog.scss';

const AIDialog = ({ isOpen, onClose, onSubmit }) => {
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setIsLoading(true);
    try {
      await onSubmit(prompt);
      setPrompt('');
      onClose();
    } catch (error) {
      console.error('AI Generation Error:', error);
      // Ideally show a toast here
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="ai-dialog-overlay" onClick={onClose}>
      <div className="ai-dialog-content" onClick={e => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder=""
            disabled={isLoading}
          />
        </form>
      </div>
    </div>
  );
};

export default AIDialog;
