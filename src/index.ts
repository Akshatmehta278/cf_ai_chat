/**
 * Cloudflare AI Chat Application - Main Entry Point
 */

export interface Env {
    AI: any;
    DB: D1Database;
    CHAT_SESSION: DurableObjectNamespace;
  }
  
  interface ChatRequest {
    message: string;
    sessionId: string;
    conversationHistory?: Array<{
      role: 'user' | 'assistant' | 'system';
      content: string;
    }>;
  }
  
  interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: string;
  }
  
  // Global variable to track database initialization
  let dbInitialized = false;
  
  async function initializeDatabase(env: Env): Promise<void> {
    if (dbInitialized) return;
    
    try {
      console.log('Initializing database...');
      // Create messages table if it doesn't exist
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
      
      console.log('Database initialized successfully');
      dbInitialized = true;
    } catch (error) {
      console.error('Failed to initialize database:', error);
    }
  }
  
  async function ensureDatabaseInitialized(env: Env): Promise<void> {
    if (!dbInitialized) {
      await initializeDatabase(env);
    }
  }
  
  export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
      // Initialize database in background but also wait for it if needed
      ctx.waitUntil(initializeDatabase(env));
      
      const url = new URL(request.url);
      const path = url.pathname;
      
      // CORS headers
      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Accept',
      };
  
      // Handle CORS preflight
      if (request.method === 'OPTIONS') {
        return new Response(null, { 
          status: 204,
          headers: corsHeaders 
        });
      }
  
      // API routes
      if (path === '/api/chat' && request.method === 'POST') {
        return await handleChat(request, env, corsHeaders);
      }
  
      if (path === '/api/history' && request.method === 'GET') {
        return await handleGetHistory(request, env, corsHeaders);
      }
  
      if (path === '/api/history' && request.method === 'DELETE') {
        return await handleDeleteHistory(request, env, corsHeaders);
      }
  
      // Serve frontend HTML
      if (path === '/' || path === '/index.html') {
        return new Response(getHTML(), {
          headers: { ...corsHeaders, 'Content-Type': 'text/html' }
        });
      }
  
      // 404
      return new Response('Not Found', { 
        status: 404,
        headers: corsHeaders 
      });
    }
  };
  
  // Handler functions
  async function handleChat(request: Request, env: Env, corsHeaders: HeadersInit): Promise<Response> {
    try {
      // Ensure database is initialized before proceeding
      await ensureDatabaseInitialized(env);
      
      const body = await request.json() as ChatRequest;
      const { message, sessionId, conversationHistory = [] } = body;
  
      if (!message || !sessionId) {
        return jsonResponse({ 
          success: false, 
          error: 'Missing required fields' 
        }, corsHeaders, 400);
      }
  
      // Prepare messages for AI
      const messages: any[] = [];
      
      // Add conversation history
      conversationHistory.forEach((msg) => {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      });
      
      // Add current user message
      messages.push({
        role: 'user',
        content: message
      });
  
      // Call Workers AI
      const aiResponse = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
        messages: messages,
        stream: false,
        max_tokens: 1024,
        temperature: 0.7,
      });
  
      const assistantMessage: Message = {
        role: 'assistant',
        content: aiResponse.response || 'No response generated',
        timestamp: new Date().toISOString()
      };
  
      // Save to database (with error handling)
      try {
        await env.DB.prepare(
          'INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)'
        ).bind(sessionId, 'user', message).run();
        
        await env.DB.prepare(
          'INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)'
        ).bind(sessionId, 'assistant', assistantMessage.content).run();
      } catch (dbError) {
        console.warn('Database save failed, but continuing:', dbError);
      }
  
      return jsonResponse({
        success: true,
        message: assistantMessage
      }, corsHeaders);
  
    } catch (error: any) {
      console.error('Chat error:', error);
      return jsonResponse({
        success: false,
        error: error.message || 'Internal server error'
      }, corsHeaders, 500);
    }
  }
  
  async function handleGetHistory(request: Request, env: Env, corsHeaders: HeadersInit): Promise<Response> {
    try {
      // Ensure database is initialized before proceeding
      await ensureDatabaseInitialized(env);
      
      const url = new URL(request.url);
      const sessionId = url.searchParams.get('sessionId');
  
      if (!sessionId) {
        return jsonResponse({ 
          success: false, 
          error: 'Missing sessionId' 
        }, corsHeaders, 400);
      }
  
      const { results } = await env.DB.prepare(
        'SELECT role, content, timestamp FROM messages WHERE session_id = ? ORDER BY timestamp ASC'
      ).bind(sessionId).all();
  
      const messages: Message[] = (results as any[]).map((r) => ({
        role: r.role as 'user' | 'assistant' | 'system',
        content: r.content,
        timestamp: r.timestamp
      }));
  
      return jsonResponse({
        success: true,
        messages
      }, corsHeaders);
  
    } catch (error: any) {
      console.error('History error:', error);
      return jsonResponse({
        success: false,
        error: error.message || 'Internal server error'
      }, corsHeaders, 500);
    }
  }
  
  async function handleDeleteHistory(request: Request, env: Env, corsHeaders: HeadersInit): Promise<Response> {
    try {
      // Ensure database is initialized before proceeding
      await ensureDatabaseInitialized(env);
      
      const url = new URL(request.url);
      const sessionId = url.searchParams.get('sessionId');
  
      if (!sessionId) {
        return jsonResponse({ 
          success: false, 
          error: 'Missing sessionId' 
        }, corsHeaders, 400);
      }
  
      await env.DB.prepare(
        'DELETE FROM messages WHERE session_id = ?'
      ).bind(sessionId).run();
  
      return jsonResponse({
        success: true,
        message: 'History deleted'
      }, corsHeaders);
  
    } catch (error: any) {
      console.error('Delete error:', error);
      return jsonResponse({
        success: false,
        error: error.message || 'Internal server error'
      }, corsHeaders, 500);
    }
  }
  
  // Helper function for JSON responses
  function jsonResponse(data: any, headers: HeadersInit, status: number = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { ...headers, 'Content-Type': 'application/json' }
    });
  }
  
  // Modern HTML frontend matching your design
  function getHTML(): string {
    return `<!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>AI Chat Assistant - Cloudflare Workers AI</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
      <style>
          * { font-family: 'Inter', sans-serif; }
          
          .gradient-bg {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          }
          
          .glass {
              background: rgba(255, 255, 255, 0.95);
              backdrop-filter: blur(10px);
              border: 1px solid rgba(255, 255, 255, 0.2);
          }
          
          .message-enter {
              animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          }
          
          @keyframes slideIn {
              from { opacity: 0; transform: translateY(20px); }
              to { opacity: 1; transform: translateY(0); }
          }
          
          .typing-dot {
              animation: bounce 1.4s infinite;
          }
          
          .typing-dot:nth-child(2) { animation-delay: 0.2s; }
          .typing-dot:nth-child(3) { animation-delay: 0.4s; }
          
          @keyframes bounce {
              0%, 60%, 100% { transform: translateY(0); }
              30% { transform: translateY(-8px); }
          }
          
          .feature-card {
              transition: all 0.3s ease;
              cursor: pointer;
          }
          
          .feature-card:hover {
              transform: translateY(-5px);
              box-shadow: 0 20px 40px rgba(99, 102, 241, 0.1);
          }
          
          .tech-badge {
              transition: all 0.2s ease;
          }
          
          .tech-badge:hover {
              transform: scale(1.05);
          }
          
          .scrollbar-thin::-webkit-scrollbar {
              width: 6px;
          }
          
          .scrollbar-thin::-webkit-scrollbar-track {
              background: #f1f5f9;
              border-radius: 3px;
          }
          
          .scrollbar-thin::-webkit-scrollbar-thumb {
              background: #cbd5e1;
              border-radius: 3px;
          }
          
          .scrollbar-thin::-webkit-scrollbar-thumb:hover {
              background: #94a3b8;
          }
      </style>
  </head>
  <body class="bg-gradient-to-br from-gray-50 to-blue-50 min-h-screen">
      <div class="flex flex-col h-screen max-w-6xl mx-auto">
          <!-- Header -->
          <header class="glass shadow-lg border-b border-gray-200 sticky top-0 z-10">
              <div class="px-8 py-5">
                  <div class="flex items-center justify-between">
                      <div class="flex items-center gap-4">
                          <div class="gradient-bg p-3 rounded-xl shadow-lg">
                              <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                              </svg>
                          </div>
                          <div>
                              <h1 class="text-2xl font-bold text-gray-900">AI Chat Assistant</h1>
                              <div class="flex items-center gap-2 text-sm">
                                  <span class="flex items-center gap-1.5">
                                      <span class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                                      <span class="text-gray-600 font-medium">Online</span>
                                  </span>
                                  <span class="text-gray-400">•</span>
                                  <span class="text-gray-600 font-medium" id="title">Ready to help</span>
                              </div>
                          </div>
                      </div>
                      <div class="flex items-center gap-2">
                          <div class="bg-gray-100 px-3 py-2 rounded-lg">
                              <span class="text-gray-900 font-bold" id="count">0</span>
                              <span class="text-gray-600 text-sm ml-1">messages</span>
                          </div>
                          <button id="newBtn" class="tech-badge bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg flex items-center gap-2">
                              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                              </svg>
                              New
                          </button>
                          <button id="clrBtn" class="tech-badge bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg flex items-center gap-2">
                              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                              </svg>
                              Clear
                          </button>
                      </div>
                  </div>
              </div>
          </header>
  
          <!-- Tech Stack Banner -->
          <div class="bg-white border-b p-4">
              <div class="flex justify-center gap-6 text-sm">
                  <div class="tech-badge bg-blue-50 text-blue-700 px-4 py-2 rounded-lg font-medium flex items-center gap-2">
                      <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                      </svg>
                      Llama 3.3 70B
                  </div>
                  <div class="tech-badge bg-indigo-50 text-indigo-700 px-4 py-2 rounded-lg font-medium flex items-center gap-2">
                      <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                      </svg>
                      D1 Database
                  </div>
                  <div class="tech-badge bg-purple-50 text-purple-700 px-4 py-2 rounded-lg font-medium flex items-center gap-2">
                      <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                      </svg>
                      Durable Objects
                  </div>
                  <div class="tech-badge bg-green-50 text-green-700 px-4 py-2 rounded-lg font-medium flex items-center gap-2">
                      <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                      </svg>
                      Zero External APIs
                  </div>
              </div>
          </div>
  
          <!-- Messages Container -->
          <div id="msgBox" class="flex-1 overflow-auto scrollbar-thin px-8 py-8">
              <div id="msgs" class="space-y-6"></div>
              
              <!-- Welcome Screen -->
              <div id="welcome" class="flex items-center justify-center h-full">
                  <div class="text-center max-w-4xl">
                      <div class="w-24 h-24 gradient-bg rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-xl">
                          <svg class="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                          </svg>
                      </div>
                      <h2 class="text-5xl font-bold text-gray-900 mb-3">Hello! 👋</h2>
                      <p class="text-xl text-gray-600 font-medium mb-12">How can I help you today?</p>
                      
                      <div class="grid grid-cols-2 gap-6 max-w-3xl mx-auto">
                          <div class="feature-card glass p-6 rounded-2xl group">
                              <div class="text-4xl mb-4">💡</div>
                              <div class="font-bold text-gray-900 text-lg mb-2">Ask Anything</div>
                              <div class="text-sm text-gray-600">Get instant AI-powered answers</div>
                              <div class="mt-3 text-xs text-blue-600 font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                                  Try: "Explain quantum computing"
                              </div>
                          </div>
                          
                          <div class="feature-card glass p-6 rounded-2xl group">
                              <div class="text-4xl mb-4">🚀</div>
                              <div class="font-bold text-gray-900 text-lg mb-2">Lightning Fast</div>
                              <div class="text-sm text-gray-600">Edge computing responses</div>
                              <div class="mt-3 text-xs text-blue-600 font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                                  Powered by global network
                              </div>
                          </div>
                          
                          <div class="feature-card glass p-6 rounded-2xl group">
                              <div class="text-4xl mb-4">💾</div>
                              <div class="font-bold text-gray-900 text-lg mb-2">Auto-Saved</div>
                              <div class="text-sm text-gray-600">Never lose a conversation</div>
                              <div class="mt-3 text-xs text-blue-600 font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                                  Stored in D1 Database
                              </div>
                          </div>
                          
                          <div class="feature-card glass p-6 rounded-2xl group">
                              <div class="text-4xl mb-4">🔒</div>
                              <div class="font-bold text-gray-900 text-lg mb-2">100% Private</div>
                              <div class="text-sm text-gray-600">No external APIs</div>
                              <div class="mt-3 text-xs text-blue-600 font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                                  All on Cloudflare platform
                              </div>
                          </div>
                      </div>
                      
                      <div class="mt-12 glass p-6 rounded-xl inline-block">
                          <div class="flex items-center gap-3 text-sm text-gray-700">
                              <svg class="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                                  <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
                              </svg>
                              <span><strong>Pro Tip:</strong> Your conversation is automatically saved!</span>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
  
          <!-- Input Area -->
          <div class="glass border-t border-gray-200 shadow-xl">
              <div class="px-8 py-6">
                  <div class="flex gap-4 items-end">
                      <textarea 
                          id="inp" 
                          rows="1" 
                          placeholder="Message AI Assistant..." 
                          class="flex-1 px-5 py-4 bg-white border-2 border-gray-300 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 text-base resize-none transition-all shadow-sm scrollbar-thin"
                          style="max-height: 150px"
                      ></textarea>
                      <button 
                          id="snd" 
                          class="gradient-bg text-white rounded-xl hover:opacity-90 font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all px-8 py-4 flex items-center gap-2"
                      >
                          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
                          </svg>
                          Send
                      </button>
                  </div>
                  <div class="flex justify-between mt-4">
                      <div class="flex gap-2 text-xs text-gray-600 items-center">
                          <kbd class="px-2 py-1 bg-gray-100 rounded font-mono border border-gray-300">Enter</kbd>
                          <span>to send</span>
                          <span class="text-gray-400">•</span>
                          <kbd class="px-2 py-1 bg-gray-100 rounded font-mono border border-gray-300">Shift+Enter</kbd>
                          <span>new line</span>
                      </div>
                      <span class="text-xs text-gray-500 font-medium">Powered by Cloudflare Workers AI</span>
                  </div>
              </div>
          </div>
      </div>
  
      <script>
          // Session Management
          const sessionId = localStorage.getItem('sid') || 'session_' + Date.now();
          localStorage.setItem('sid', sessionId);
          
          let conversationHistory = [];
          let messageCount = 0;
  
          // DOM Elements
          const messagesContainer = document.getElementById('msgs');
          const welcomeScreen = document.getElementById('welcome');
          const input = document.getElementById('inp');
          const sendBtn = document.getElementById('snd');
          const clearBtn = document.getElementById('clrBtn');
          const newBtn = document.getElementById('newBtn');
          const countDisplay = document.getElementById('count');
          const titleDisplay = document.getElementById('title');
  
          // Auto-resize textarea
          input.addEventListener('input', function() {
              this.style.height = 'auto';
              this.style.height = Math.min(this.scrollHeight, 150) + 'px';
          });
  
          // Load history on page load
          loadHistory();
  
          // Send message function
          async function sendMessage() {
              const message = input.value.trim();
              if (!message) return;
  
              // Hide welcome screen
              welcomeScreen.style.display = 'none';
              
              // Add user message
              addMessage('user', message);
              
              // Clear input
              input.value = '';
              input.style.height = 'auto';
              
              // Disable send button
              sendBtn.disabled = true;
              sendBtn.innerHTML = '<svg class="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Sending...';
  
              // Show typing indicator
              showTypingIndicator();
  
              try {
                  // Prepare request
                  const requestData = {
                      message: message,
                      sessionId: sessionId,
                      conversationHistory: conversationHistory.slice(0, -1)
                  };
  
                  // Send to API
                  const response = await fetch('/api/chat', {
                      method: 'POST',
                      headers: { 
                          'Content-Type': 'application/json',
                          'Accept': 'application/json'
                      },
                      body: JSON.stringify(requestData)
                  });
  
                  // Remove typing indicator
                  removeTypingIndicator();
  
                  if (!response.ok) {
                      const errorData = await response.json();
                      addMessage('assistant', '❌ Error: ' + (errorData.error || 'Unknown error'), true);
                      return;
                  }
  
                  const data = await response.json();
                  
                  if (data.success && data.message && data.message.content) {
                      addMessage('assistant', data.message.content);
                  } else {
                      addMessage('assistant', '❌ No response received', true);
                  }
  
              } catch (error) {
                  console.error('Send error:', error);
                  removeTypingIndicator();
                  addMessage('assistant', '❌ Network error - please check your connection', true);
              } finally {
                  // Re-enable send button
                  sendBtn.disabled = false;
                  sendBtn.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>Send';
                  input.focus();
              }
          }
  
          // Add message to UI
          function addMessage(role, content, isError = false) {
              const messageDiv = document.createElement('div');
              messageDiv.className = 'message-enter flex ' + (role === 'user' ? 'justify-end' : 'justify-start');
              
              const bgColor = role === 'user' 
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white'
                  : isError 
                      ? 'bg-red-50 text-red-900 border-2 border-red-200'
                      : 'glass text-gray-900';
              
              const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              
              const icon = role === 'user' 
                  ? '<div class="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center"><svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg></div>'
                  : '<div class="w-8 h-8 rounded-full ' + (isError ? 'bg-red-500' : 'bg-purple-500') + ' flex items-center justify-center"><svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z"></path><path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z"></path></svg></div>';
              
              const sender = role === 'user' ? 'You' : 'AI Assistant';
              
              messageDiv.innerHTML = '<div class="max-w-2xl rounded-2xl px-6 py-4 ' + bgColor + ' shadow-md">' +
                  '<div class="flex items-center gap-2 mb-2">' +
                  icon +
                  '<span class="font-semibold text-sm">' + sender + '</span>' +
                  '<span class="text-xs opacity-75 ml-2">' + time + '</span>' +
                  '</div>' +
                  '<div class="whitespace-pre-wrap break-words leading-relaxed">' + escapeHtml(content) + '</div>' +
                  '</div>';
  
              messagesContainer.appendChild(messageDiv);
              conversationHistory.push({ role, content });
              messageCount++;
              countDisplay.textContent = messageCount;
              scrollToBottom();
              
              // Update title with first message preview
              if (messageCount === 1) {
                  titleDisplay.textContent = content.substring(0, 40) + (content.length > 40 ? '...' : '');
              }
          }
  
          // Show typing indicator
          function showTypingIndicator() {
              const typingDiv = document.createElement('div');
              typingDiv.id = 'typing-indicator';
              typingDiv.className = 'message-enter flex justify-start';
              typingDiv.innerHTML = '<div class="glass rounded-2xl px-6 py-4 shadow-md">' +
                  '<div class="flex items-center gap-3">' +
                  '<div class="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center">' +
                  '<svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">' +
                  '<path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z"></path>' +
                  '<path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z"></path>' +
                  '</svg></div>' +
                  '<div><div class="font-semibold text-sm text-gray-900">AI Assistant</div>' +
                  '<div class="flex items-center gap-1 mt-1">' +
                  '<div class="typing-dot w-2 h-2 bg-purple-500 rounded-full"></div>' +
                  '<div class="typing-dot w-2 h-2 bg-purple-500 rounded-full"></div>' +
                  '<div class="typing-dot w-2 h-2 bg-purple-500 rounded-full"></div>' +
                  '</div></div></div></div>';
              
              messagesContainer.appendChild(typingDiv);
              scrollToBottom();
          }
  
          // Remove typing indicator
          function removeTypingIndicator() {
              const typingIndicator = document.getElementById('typing-indicator');
              if (typingIndicator) {
                  typingIndicator.remove();
              }
          }
  
          // Load conversation history
          async function loadHistory() {
              try {
                  const response = await fetch('/api/history?sessionId=' + sessionId);
                  if (response.ok) {
                      const data = await response.json();
                      if (data.success && data.messages && data.messages.length > 0) {
                          // Hide welcome screen
                          welcomeScreen.style.display = 'none';
                          
                          // Load messages
                          data.messages.forEach(msg => {
                              addMessage(msg.role, msg.content);
                          });
                      }
                  }
              } catch (error) {
                  console.error('Failed to load history:', error);
              }
          }
  
          // Clear conversation history
          clearBtn.addEventListener('click', async () => {
              if (confirm('Are you sure you want to clear all conversation history? This cannot be undone.')) {
                  try {
                      await fetch('/api/history?sessionId=' + sessionId, { 
                          method: 'DELETE' 
                      });
                      
                      // Clear UI
                      messagesContainer.innerHTML = '';
                      conversationHistory = [];
                      messageCount = 0;
                      countDisplay.textContent = '0';
                      titleDisplay.textContent = 'Ready to help';
                      
                      // Show welcome screen
                      welcomeScreen.style.display = 'flex';
                      
                      // Show success message
                      addMessage('system', '🗑️ Conversation history cleared');
                  } catch (error) {
                      console.error('Failed to clear history:', error);
                      addMessage('system', '❌ Failed to clear history', true);
                  }
              }
          });
  
          // New conversation
          newBtn.addEventListener('click', () => {
              const newSessionId = 'session_' + Date.now();
              localStorage.setItem('sid', newSessionId);
              location.reload();
          });
  
          // Send message on Enter (not Shift+Enter)
          input.addEventListener('keydown', (e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
              }
          });
  
          // Send button click
          sendBtn.addEventListener('click', sendMessage);
  
          // Scroll to bottom
          function scrollToBottom() {
              const msgBox = document.getElementById('msgBox');
              msgBox.scrollTop = msgBox.scrollHeight;
          }
  
          // Escape HTML to prevent XSS
          function escapeHtml(text) {
              const div = document.createElement('div');
              div.textContent = text;
              return div.innerHTML;
          }
  
          // Focus input on load
          input.focus();
      </script>
  </body>
  </html>`;
  }
  
  // Durable Object for sessions
  export class ChatSession {
    private state: DurableObjectState;
    private env: Env;
  
    constructor(state: DurableObjectState, env: Env) {
      this.state = state;
      this.env = env;
    }
  
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      };
  
      if (url.pathname === '/messages' && request.method === 'GET') {
        const messages = (await this.state.storage.get('messages')) || [];
        return new Response(JSON.stringify(messages), { headers: corsHeaders });
      }
  
      if (url.pathname === '/messages' && request.method === 'POST') {
        const body = await request.json() as { message: any };
        const messages = (await this.state.storage.get('messages')) || [];
        messages.push(body.message);
        await this.state.storage.put('messages', messages);
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }
  
      if (url.pathname === '/messages' && request.method === 'DELETE') {
        await this.state.storage.delete('messages');
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }
  
      return new Response('Not Found', { status: 404 });
    }
  }