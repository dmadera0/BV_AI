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
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          position: fixed;
          bottom: 20px;
          right: 20px;
          z-index: 99999;
        }

        #buenavista-widget-container.bv-left {
          right: auto;
          left: 20px;
        }

        .bv-button {
          all: unset;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          transition: all 0.3s ease;
          border: none;
        }

        .bv-button:hover {
          transform: scale(1.1);
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
        }

        .bv-button:active {
          transform: scale(0.95);
        }

        .bv-window {
          all: unset;
          display: flex;
          flex-direction: column;
          position: absolute;
          bottom: 80px;
          right: 0;
          width: 384px;
          height: 600px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 5px 40px rgba(0, 0, 0, 0.16);
          overflow: hidden;
          animation: slideUp 0.3s ease;
        }

        #buenavista-widget-container.bv-left .bv-window {
          right: auto;
          left: 0;
        }

        .bv-window.bv-hidden {
          display: none;
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .bv-header {
          all: unset;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border-bottom: 1px solid #f0f0f0;
        }

        .bv-header h3 {
          all: unset;
          font-size: 18px;
          font-weight: 600;
          margin: 0;
        }

        .bv-close-btn {
          all: unset;
          font-size: 24px;
          cursor: pointer;
          color: white;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
          transition: background 0.2s;
        }

        .bv-close-btn:hover {
          background: rgba(255, 255, 255, 0.2);
        }

        .bv-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          background: #f9f9f9;
        }

        .bv-message {
          margin-bottom: 12px;
          word-wrap: break-word;
        }

        .bv-message.user {
          text-align: right;
        }

        .bv-message-content {
          display: inline-block;
          max-width: 80%;
          padding: 10px 14px;
          border-radius: 8px;
          font-size: 14px;
          line-height: 1.4;
        }

        .bv-message.user .bv-message-content {
          background: #667eea;
          color: white;
          border-bottom-right-radius: 2px;
        }

        .bv-message.assistant .bv-message-content {
          background: white;
          color: #333;
          border: 1px solid #e0e0e0;
          border-bottom-left-radius: 2px;
        }

        .bv-typing-indicator {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 10px 14px;
        }

        .bv-typing-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #999;
          animation: typing 1.4s infinite;
        }

        .bv-typing-dot:nth-child(2) {
          animation-delay: 0.2s;
        }

        .bv-typing-dot:nth-child(3) {
          animation-delay: 0.4s;
        }

        @keyframes typing {
          0%, 60%, 100% {
            opacity: 0.3;
            transform: translateY(0);
          }
          30% {
            opacity: 1;
            transform: translateY(-10px);
          }
        }

        .bv-input-area {
          all: unset;
          display: flex;
          gap: 8px;
          padding: 12px;
          border-top: 1px solid #e0e0e0;
          background: white;
        }

        .bv-input {
          all: unset;
          flex: 1;
          padding: 10px 12px;
          border: 1px solid #e0e0e0;
          border-radius: 6px;
          font-size: 14px;
          font-family: inherit;
          transition: border-color 0.2s;
        }

        .bv-input:focus {
          outline: none;
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .bv-input:disabled {
          background: #f5f5f5;
          color: #999;
        }

        .bv-send-btn {
          all: unset;
          padding: 10px 16px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }

        .bv-send-btn:hover:not(:disabled) {
          background: #764ba2;
        }

        .bv-send-btn:disabled {
          background: #ccc;
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
