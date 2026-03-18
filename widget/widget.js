/**
 * BuenaVista AI Chat Widget
 * Embeddable chat widget for client websites
 *
 * Usage:
 * <script src="https://cdn.buenavista.com/widget.js"></script>
 * <script>
 *   BuenaVistaWidget.init({
 *     clientId: 'your-client-id',
 *     apiUrl: 'https://api.buenavista.com/chat',
 *     position: 'bottom-right' // or 'bottom-left'
 *   });
 * </script>
 */

(function() {
  'use strict';

  const BuenaVistaWidget = {
    config: {
      clientId: null,
      apiUrl: 'https://api.buenavista.com/chat',
      position: 'bottom-right',
    },
    state: {
      isOpen: false,
      messages: [],
      isLoading: false,
    },

    /**
     * Initialize the widget with client config
     */
    init(options) {
      if (!options.clientId) {
        console.error('BuenaVistaWidget: clientId is required');
        return;
      }

      Object.assign(this.config, options);
      this.render();
      this.attachEventListeners();
    },

    /**
     * Render the widget HTML and styles
     */
    render() {
      // Create container
      const container = document.createElement('div');
      container.id = 'buenavista-widget-container';
      container.innerHTML = `
        <div id="buenavista-widget-button" class="bv-button" title="Open chat">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
        </div>
        <div id="buenavista-widget-window" class="bv-window bv-hidden">
          <div class="bv-header">
            <h3>Chat</h3>
            <button id="buenavista-widget-close" class="bv-close-btn" title="Close chat">&times;</button>
          </div>
          <div class="bv-messages" id="buenavista-widget-messages"></div>
          <div class="bv-input-area">
            <input
              type="text"
              id="buenavista-widget-input"
              class="bv-input"
              placeholder="Type a message..."
              disabled
            />
            <button id="buenavista-widget-send" class="bv-send-btn" disabled>Send</button>
          </div>
        </div>
      `;

      // Inject styles
      const style = document.createElement('style');
      style.textContent = this.getStyles();
      document.head.appendChild(style);

      // Add to page
      document.body.appendChild(container);
    },

    /**
     * Get CSS styles for the widget
     */
    getStyles() {
      return `
        #buenavista-widget-container {
          all: initial;
          font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif;
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 99999;
        }

        .bv-button {
          all: unset;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: linear-gradient(135deg, #7c6dfa, #4f46c8);
          color: white;
          cursor: pointer;
          box-shadow: 0 4px 24px rgba(124,109,250,0.4);
          transition: all 0.3s ease;
        }

        .bv-button:hover {
          transform: scale(1.1);
          box-shadow: 0 8px 32px rgba(124,109,250,0.6);
        }

        .bv-window {
          all: unset;
          display: flex;
          flex-direction: column;
          position: absolute;
          bottom: 72px;
          right: 0;
          width: 380px;
          height: 560px;
          background: #0f0f1a;
          border: 1px solid #1e1e35;
          border-radius: 20px;
          box-shadow: 0 16px 48px rgba(0,0,0,0.6), 0 0 40px rgba(124,109,250,0.1);
          overflow: hidden;
          animation: bvSlideUp 0.3s cubic-bezier(0.22,1,0.36,1);
        }

        .bv-window.bv-hidden {
          display: none;
        }

        @keyframes bvSlideUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .bv-header {
          all: unset;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          background: #16162a;
          border-bottom: 1px solid #1e1e35;
        }

        .bv-header-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .bv-header h3 {
          all: unset;
          font-size: 15px;
          font-weight: 700;
          color: #e8e8f2;
          font-family: 'Syne', sans-serif;
        }

        .bv-header-subtitle {
          font-size: 11px;
          color: #7c6dfa;
          font-weight: 500;
          letter-spacing: 0.04em;
        }

        .bv-close-btn {
          all: unset;
          font-size: 20px;
          cursor: pointer;
          color: #8888aa;
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 6px;
          transition: background 0.2s, color 0.2s;
        }

        .bv-close-btn:hover {
          background: #1e1e35;
          color: #e8e8f2;
        }

        .bv-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          background: #080811;
          display: flex;
          flex-direction: column;
          gap: 10px;
          scrollbar-width: thin;
          scrollbar-color: #1e1e35 transparent;
        }

        .bv-messages::-webkit-scrollbar { width: 4px; }
        .bv-messages::-webkit-scrollbar-track { background: transparent; }
        .bv-messages::-webkit-scrollbar-thumb { background: #1e1e35; border-radius: 2px; }

        .bv-welcome {
          text-align: center;
          color: #44445a;
          font-size: 13px;
          padding: 24px 16px;
          line-height: 1.6;
        }

        .bv-welcome-icon {
          font-size: 28px;
          margin-bottom: 8px;
        }

        .bv-message {
          display: flex;
          word-wrap: break-word;
        }

        .bv-message.user {
          justify-content: flex-end;
        }

        .bv-message.assistant {
          justify-content: flex-start;
        }

        .bv-message-content {
          max-width: 82%;
          padding: 10px 14px;
          border-radius: 14px;
          font-size: 13.5px;
          line-height: 1.6;
          color: #e8e8f2;
        }

        .bv-message.user .bv-message-content {
          background: linear-gradient(135deg, #7c6dfa, #4f46c8);
          color: white;
          border-bottom-right-radius: 4px;
        }

        .bv-message.assistant .bv-message-content {
          background: #16162a;
          border: 1px solid #1e1e35;
          color: #e8e8f2;
          border-bottom-left-radius: 4px;
        }

        .bv-typing-indicator {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 12px 14px;
        }

        .bv-typing-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #7c6dfa;
          animation: bvTyping 1.4s infinite;
        }

        .bv-typing-dot:nth-child(2) { animation-delay: 0.2s; }
        .bv-typing-dot:nth-child(3) { animation-delay: 0.4s; }

        @keyframes bvTyping {
          0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
          30%            { opacity: 1;   transform: translateY(-6px); }
        }

        .bv-input-area {
          all: unset;
          display: flex;
          gap: 8px;
          padding: 12px 16px;
          border-top: 1px solid #1e1e35;
          background: #0f0f1a;
        }

        .bv-input {
          all: unset;
          flex: 1;
          padding: 10px 14px;
          background: #16162a;
          border: 1.5px solid #1e1e35;
          border-radius: 10px;
          font-size: 13.5px;
          color: #e8e8f2;
          font-family: inherit;
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        .bv-input::placeholder { color: #44445a; }

        .bv-input:focus {
          border-color: #7c6dfa;
          box-shadow: 0 0 0 3px rgba(124,109,250,0.15);
        }

        .bv-input:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .bv-send-btn {
          all: unset;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 38px;
          height: 38px;
          background: linear-gradient(135deg, #7c6dfa, #4f46c8);
          color: white;
          border-radius: 10px;
          cursor: pointer;
          transition: opacity 0.2s, transform 0.2s;
          flex-shrink: 0;
        }

        .bv-send-btn:hover:not(:disabled) {
          opacity: 0.9;
          transform: scale(1.05);
        }

        .bv-send-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
      `;
    },

    /**
     * Attach event listeners to interactive elements
     */
    attachEventListeners() {
      const toggleBtn = document.getElementById('buenavista-widget-button');
      const closeBtn = document.getElementById('buenavista-widget-close');
      const sendBtn = document.getElementById('buenavista-widget-send');
      const inputField = document.getElementById('buenavista-widget-input');

      toggleBtn.addEventListener('click', () => this.toggle());
      closeBtn.addEventListener('click', () => this.close());
      sendBtn.addEventListener('click', () => this.sendMessage());

      inputField.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !this.state.isLoading) {
          this.sendMessage();
        }
      });
    },

    /**
     * Toggle chat window open/closed
     */
    toggle() {
      if (this.state.isOpen) {
        this.close();
      } else {
        this.open();
      }
    },

    /**
     * Open the chat window
     */
    open() {
      const container = document.getElementById('buenavista-widget-container');
      const window = document.getElementById('buenavista-widget-window');
      const inputField = document.getElementById('buenavista-widget-input');

      if (this.config.position === 'bottom-left') {
        container.classList.add('bv-left');
      }

      window.classList.remove('bv-hidden');
      this.state.isOpen = true;
      inputField.focus();
      inputField.disabled = false;
      document.getElementById('buenavista-widget-send').disabled = false;
    },

    /**
     * Close the chat window
     */
    close() {
      const window = document.getElementById('buenavista-widget-window');
      window.classList.add('bv-hidden');
      this.state.isOpen = false;
    },

    /**
     * Send a message to the chat API
     */
    async sendMessage() {
      const inputField = document.getElementById('buenavista-widget-input');
      const sendBtn = document.getElementById('buenavista-widget-send');
      const message = inputField.value.trim();

      if (!message) {
        return;
      }

      // Add user message to local state
      this.state.messages.push({
        role: 'user',
        content: message,
      });

      this.addMessageToUI(message, 'user');
      inputField.value = '';
      inputField.disabled = true;
      sendBtn.disabled = true;
      this.state.isLoading = true;

      // Show typing indicator
      this.showTypingIndicator();

      try {
        const response = await fetch(this.config.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            clientId: this.config.clientId,
            messages: this.state.messages,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          this.addMessageToUI(
            data.error || 'An error occurred. Please try again.',
            'assistant'
          );
          return;
        }

        // Extract assistant response
        const assistantMessage = data.content[0]?.text || 'Unable to parse response';
        this.state.messages.push({
          role: 'assistant',
          content: assistantMessage,
        });

        this.addMessageToUI(assistantMessage, 'assistant');
      } catch (error) {
        console.error('Failed to send message:', error);
        this.addMessageToUI('Connection error. Please try again.', 'assistant');
      } finally {
        this.removeTypingIndicator();
        inputField.disabled = false;
        sendBtn.disabled = false;
        this.state.isLoading = false;
        inputField.focus();
      }
    },

    /**
     * Add a message to the UI
     */
    addMessageToUI(content, role) {
      const messagesDiv = document.getElementById('buenavista-widget-messages');
      const messageEl = document.createElement('div');
      messageEl.className = `bv-message ${role}`;

      const contentEl = document.createElement('div');
      contentEl.className = 'bv-message-content';
      contentEl.textContent = content;

      messageEl.appendChild(contentEl);
      messagesDiv.appendChild(messageEl);

      // Scroll to bottom
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    },

    /**
     * Show typing indicator
     */
    showTypingIndicator() {
      const messagesDiv = document.getElementById('buenavista-widget-messages');
      const indicatorEl = document.createElement('div');
      indicatorEl.id = 'buenavista-typing-indicator';
      indicatorEl.className = 'bv-message assistant';
      indicatorEl.innerHTML =
        '<div class="bv-typing-indicator"><div class="bv-typing-dot"></div><div class="bv-typing-dot"></div><div class="bv-typing-dot"></div></div>';
      messagesDiv.appendChild(indicatorEl);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    },

    /**
     * Remove typing indicator
     */
    removeTypingIndicator() {
      const indicator = document.getElementById('buenavista-typing-indicator');
      if (indicator) {
        indicator.remove();
      }
    },
  };

  // Expose globally
  window.BuenaVistaWidget = BuenaVistaWidget;
})();
