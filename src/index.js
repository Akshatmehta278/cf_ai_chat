export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;
        
        // CORS headers
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Accept',
            'Access-Control-Max-Age': '86400',
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
            return handleChat(request, env, corsHeaders);
        }

        if (path === '/api/history' && request.method === 'GET') {
            return handleGetHistory(request, env, corsHeaders);
        }

        if (path === '/api/history' && request.method === 'DELETE') {
            return handleDeleteHistory(request, env, corsHeaders);
        }

        // Serve frontend files
        if (path === '/' || path === '/index.html') {
            return serveFrontend('index.html', corsHeaders);
        }

        if (path === '/style.css') {
            return serveFrontend('style.css', corsHeaders, 'text/css');
        }

        if (path === '/app.js') {
            return serveFrontend('app.js', corsHeaders, 'application/javascript');
        }

        // 404 for unknown routes
        return new Response('Not Found', { 
            status: 404,
            headers: corsHeaders 
        });
    }
};

// Serve static files
function serveFrontend(filename, corsHeaders, contentType = 'text/html') {
    let content = '';
    
    if (filename === 'index.html') {
        // Return the fixed HTML from above
        content = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cloudflare AI Chat Assistant</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div class="app">
        <header>
            <h1>AI Chat Assistant</h1>
            <p>Powered by Cloudflare Workers AI + Llama 3.3</p>
        </header>

        <main id="chat">
            <div class="message system">
                🤖 Welcome! This AI assistant is powered by Cloudflare's Workers AI.
                <br>
                Ask me anything - I'm here to help!
            </div>
        </main>

        <footer>
            <input 
                type="text" 
                id="input" 
                placeholder="Type your message here..."
                autocomplete="off"
                autofocus
            >
            <button id="send">
                Send
            </button>
        </footer>
    </div>

    <script>
        // [Same JavaScript as in index.html above]
        const chat = document.getElementById("chat");
        const input = document.getElementById("input");
        const sendBtn = document.getElementById("send");
        const sessionId = \`session_\${Date.now()}_\${Math.random().toString(36).substr(2, 9)}\`;
        let conversationHistory = [];

        function addMessage(role, text) {
            const div = document.createElement("div");
            div.className = \`message \${role}\`;
            div.textContent = text;
            chat.appendChild(div);
            chat.scrollTop = chat.scrollHeight;
            conversationHistory.push({ role, content: text });
        }

        function showTyping() {
            const loader = document.createElement("div");
            loader.className = "message system";
            loader.id = "typing-indicator";
            loader.textContent = "AI is thinking...";
            chat.appendChild(loader);
            chat.scrollTop = chat.scrollHeight;
        }

        function hideTyping() {
            const loader = document.getElementById("typing-indicator");
            if (loader) loader.remove();
        }

        async function sendMessage() {
            const text = input.value.trim();
            if (!text) return;

            input.value = "";
            addMessage("user", text);
            showTyping();
            sendBtn.disabled = true;
            input.disabled = true;

            try {
                const requestData = {
                    message: text,
                    sessionId: sessionId,
                    conversationHistory: conversationHistory.slice(0, -1)
                };

                const res = await fetch("/api/chat", {
                    method: "POST",
                    headers: { 
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    },
                    body: JSON.stringify(requestData)
                });

                hideTyping();

                if (!res.ok) {
                    const errorData = await res.json().catch(() => ({}));
                    addMessage("assistant", \`❌ Error: \${errorData.error || \`Server error (\${res.status})\`}\`);
                    return;
                }

                const data = await res.json();
                if (data.success && data.message && data.message.content) {
                    addMessage("assistant", data.message.content);
                } else {
                    addMessage("assistant", "❌ No response received from server");
                }

            } catch (err) {
                hideTyping();
                console.error("Network error:", err);
                addMessage("assistant", "❌ Network error - please check your connection");
            } finally {
                sendBtn.disabled = false;
                input.disabled = false;
                input.focus();
            }
        }

        sendBtn.onclick = sendMessage;
        input.onkeydown = (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        };

        async function loadHistory() {
            try {
                const res = await fetch(\`/api/history?sessionId=\${sessionId}\`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.success && data.messages && data.messages.length > 0) {
                        const systemMsg = document.querySelector('.message.system');
                        if (systemMsg) systemMsg.remove();
                        data.messages.forEach(msg => {
                            addMessage(msg.role, msg.content);
                        });
                    }
                }
            } catch (error) {
                console.error("Failed to load history:", error);
            }
        }

        loadHistory();
        input.focus();
    </script>
</body>
</html>`;
    } else if (filename === 'style.css') {
        // Return the CSS file content
        content = `* {
    box-sizing: border-box;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
}

body {
    margin: 0;
    background: #0f172a;
    color: #e5e7eb;
    height: 100vh;
}

.app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    max-width: 720px;
    margin: 0 auto;
    background: #020617;
    box-shadow: 0 0 20px rgba(0, 0, 0, 0.3);
}

header {
    padding: 16px;
    background: #020617;
    border-bottom: 1px solid #1e293b;
    text-align: center;
}

header h1 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
    color: #e5e7eb;
}

header p {
    margin: 4px 0 0 0;
    font-size: 0.875rem;
    color: #94a3b8;
}

main {
    flex: 1;
    padding: 16px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.message {
    max-width: 80%;
    padding: 12px 16px;
    border-radius: 12px;
    line-height: 1.4;
    word-wrap: break-word;
    animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
}

.user {
    background: #2563eb;
    align-self: flex-end;
    color: white;
}

.assistant {
    background: #1e293b;
    align-self: flex-start;
    color: #e5e7eb;
    border: 1px solid #334155;
}

.system {
    background: transparent;
    color: #94a3b8;
    font-size: 13px;
    text-align: center;
    align-self: center;
    max-width: 100%;
    border: 1px dashed #475569;
}

footer {
    display: flex;
    padding: 16px;
    gap: 12px;
    border-top: 1px solid #1e293b;
    background: #020617;
}

input {
    flex: 1;
    padding: 12px 16px;
    border-radius: 8px;
    border: 1px solid #334155;
    outline: none;
    background: #0f172a;
    color: white;
    font-size: 1rem;
}

input:focus {
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

button {
    padding: 12px 24px;
    background: #22c55e;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
    color: white;
    font-size: 1rem;
    transition: background-color 0.2s;
}

button:hover:not(:disabled) {
    background: #16a34a;
}

button:disabled {
    background: #475569;
    cursor: not-allowed;
    opacity: 0.7;
}

#typing-indicator::after {
    content: '...';
    animation: dots 1.5s steps(4, end) infinite;
}

@keyframes dots {
    0%, 20% { content: '.'; }
    40% { content: '..'; }
    60%, 100% { content: '...'; }
}`;
    }

    return new Response(content, {
        headers: {
            ...corsHeaders,
            'Content-Type': contentType,
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
    });
}

// Handle chat messages
async function handleChat(request, env, corsHeaders) {
    try {
        const { message, sessionId, conversationHistory = [] } = await request.json();

        if (!message || !sessionId) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: 'Missing required fields: message and sessionId are required' 
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Prepare conversation messages
        const messages = [];
        
        // Add conversation history
        conversationHistory.forEach(msg => {
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

        // Call Cloudflare AI
        const aiResponse = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
            messages: messages,
            stream: false,
            max_tokens: 1024,
            temperature: 0.7,
        });

        const assistantMessage = {
            role: 'assistant',
            content: aiResponse.response || aiResponse.result?.response || 'No response generated',
            timestamp: new Date().toISOString()
        };

        // Save to database if available
        if (env.DB) {
            try {
                await env.DB.prepare(
                    'INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)'
                ).bind(sessionId, 'user', message).run();
                
                await env.DB.prepare(
                    'INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)'
                ).bind(sessionId, 'assistant', assistantMessage.content).run();
            } catch (dbError) {
                console.warn('Database save failed (continuing anyway):', dbError);
            }
        }

        return new Response(JSON.stringify({
            success: true,
            message: assistantMessage
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Chat error:', error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message || 'Internal server error'
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
}

// Get conversation history
async function handleGetHistory(request, env, corsHeaders) {
    try {
        const url = new URL(request.url);
        const sessionId = url.searchParams.get('sessionId');

        if (!sessionId) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: 'Missing sessionId parameter' 
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        let messages = [];
        
        // Try to get from database if available
        if (env.DB) {
            try {
                const { results } = await env.DB.prepare(
                    'SELECT role, content, timestamp FROM messages WHERE session_id = ? ORDER BY timestamp ASC'
                ).bind(sessionId).all();
                
                messages = results.map(r => ({
                    role: r.role,
                    content: r.content,
                    timestamp: r.timestamp
                }));
            } catch (dbError) {
                console.warn('Database read failed:', dbError);
            }
        }

        return new Response(JSON.stringify({
            success: true,
            messages: messages
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('History retrieval error:', error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message || 'Internal server error'
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
}

// Delete conversation history
async function handleDeleteHistory(request, env, corsHeaders) {
    try {
        const url = new URL(request.url);
        const sessionId = url.searchParams.get('sessionId');

        if (!sessionId) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: 'Missing sessionId parameter' 
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Delete from database if available
        if (env.DB) {
            try {
                await env.DB.prepare(
                    'DELETE FROM messages WHERE session_id = ?'
                ).bind(sessionId).run();
            } catch (dbError) {
                console.warn('Database delete failed:', dbError);
            }
        }

        return new Response(JSON.stringify({
            success: true,
            message: 'History deleted successfully'
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Delete error:', error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message || 'Internal server error'
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
}
