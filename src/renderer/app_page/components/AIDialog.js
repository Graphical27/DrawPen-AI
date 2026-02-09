import React, { useState, useEffect, useRef } from 'react';
import { FaStar, FaRegStar } from "react-icons/fa";
import './AIDialog.scss';

const AIDialog = ({ isOpen, onClose, onSubmit }) => {
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [pinnedPrompts, setPinnedPrompts] = useState([]);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
      if (textareaRef.current) {
        // slight delay to focus after render
        setTimeout(() => textareaRef.current.focus(), 50);
      }
    }
  }, [isOpen]);

  const fetchHistory = async () => {
    try {
      const hist = await window.electronAPI.invokeGetAIHistory();
      const pins = await window.electronAPI.invokeGetPinnedAIPrompts();
      setHistory(hist || []);
      setPinnedPrompts(pins || []);
    } catch (error) {
      console.error("Failed to fetch history:", error);
    }
  };

  const handleSubmit = async (e, specificPrompt) => {
    if (e) e.preventDefault();
    const promptToSubmit = specificPrompt || prompt;

    if (!promptToSubmit.trim()) return;

    setIsLoading(true);
    try {
      await onSubmit(promptToSubmit);
      setPrompt('');
      onClose();
    } catch (error) {
      console.error('AI Generation Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTogglePin = async (e, item) => {
    e.stopPropagation();
    try {
      const newPins = await window.electronAPI.invokeTogglePinAIPrompt(item);
      setPinnedPrompts(newPins || []);
    } catch (error) {
      console.error("Failed to toggle pin:", error);
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

  const lowerPrompt = prompt.toLowerCase();
  const filteredPins = pinnedPrompts.filter(p => p.toLowerCase().includes(lowerPrompt));
  const filteredHistory = history.filter(h => 
    h.toLowerCase().includes(lowerPrompt) && !pinnedPrompts.includes(h)
  );

  const hasItems = filteredPins.length > 0 || filteredHistory.length > 0;

  return (
    <div className="ai-dialog-overlay" onClick={onClose}>
      <div className="ai-dialog-content" onClick={e => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe what you want to draw..."
            disabled={isLoading}
          />
        </form>

        {hasItems && (
           <div className="ai-history-list">
             {filteredPins.map(item => (
               <div key={`pin-${item}`} className="history-item pinned" onClick={(e) => handleSubmit(e, item)}>
                 <span className="history-text">{item}</span>
                 <span className="pin-icon active" onClick={(e) => handleTogglePin(e, item)}>
                    <FaStar />
                 </span>
               </div>
             ))}
             {filteredHistory.map(item => (
               <div key={`hist-${item}`} className="history-item" onClick={(e) => handleSubmit(e, item)}>
                 <span className="history-text">{item}</span>
                 <span className="pin-icon" onClick={(e) => handleTogglePin(e, item)}>
                    <FaRegStar />
                 </span>
               </div>
             ))}
           </div>
        )}
      </div>
    </div>
  );
};

export default AIDialog;
