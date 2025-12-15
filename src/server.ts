/**
 * Server - Handles routing, request/response, and coordination
 */

import type { Env, ChatRequest, ChatResponse, HistoryResponse, Message } from './types';
import { createAgent } from './agent';

export class Server {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const corsHeaders = this.getCorsHeaders();

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      switch (true) {
        case url.pathname === '/api/chat' && request.method === 'POST':
          return await this.handleChat(request, corsHeaders);
        case url.pathname === '/api/history' && request.method === 'GET':
          return await this.handleGetHistory(request, corsHeaders);
        case url.pathname === '/api/history' && request.method === 'DELETE':
          return await this.handleDeleteHistory(request, corsHeaders);
        case url.pathname === '/health':
          return this.jsonResponse({ status: 'ok', timestamp: new Date().toISOString() }, corsHeaders);
        case url.pathname === '/' || url.pathname === '/index.html':
          return this.handleFrontend(corsHeaders);
        default:
          return this.jsonResponse({ error: 'Not Found' }, corsHeaders, 404);
      }
    } catch (error) {
      console.error('Server error:', error);
      return this.jsonResponse({ error: 'Internal Server Error' }, corsHeaders, 500);
    }
  }

  private async handleChat(request: Request, corsHeaders: HeadersInit): Promise<Response> {
    try {
      const body = await request.json() as ChatRequest;
      const { message, sessionId, conversationHistory = [] } = body;

      if (!message || !sessionId) {
        return this.jsonResponse({ success: false, error: 'Missing required fields' }, corsHeaders, 400);
      }

      const agent = createAgent(this.env);
      const agentResponse = await agent.processMessage({
        sessionId,
        conversationHistory,
        userMessage: message,
      });

      await this.saveMessage(sessionId, 'user', message);
      await this.saveMessage(sessionId, 'assistant', agentResponse.content);

      const assistantMessage: Message = {
        role: 'assistant',
        content: agentResponse.content,
        timestamp: new Date().toISOString(),
      };

      return this.jsonResponse({ success: true, message: assistantMessage }, corsHeaders);
    } catch (error) {
      console.error('Chat error:', error);
      return this.jsonResponse(
        { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
        corsHeaders,
        500
      );
    }
  }

  private async handleGetHistory(request: Request, corsHeaders: HeadersInit): Promise<Response> {
    try {
      const url = new URL(request.url);
      const sessionId = url.searchParams.get('sessionId');

      if (!sessionId) {
        return this.jsonResponse({ success: false, error: 'Missing sessionId' }, corsHeaders, 400);
      }

      const messages = await this.getMessages(sessionId);
      return this.jsonResponse({ success: true, messages }, corsHeaders);
    } catch (error) {
      console.error('History error:', error);
      return this.jsonResponse(
        { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
        corsHeaders,
        500
      );
    }
  }

  private async handleDeleteHistory(request: Request, corsHeaders: HeadersInit): Promise<Response> {
    try {
      const url = new URL(request.url);
      const sessionId = url.searchParams.get('sessionId');

      if (!sessionId) {
        return this.jsonResponse({ success: false, error: 'Missing sessionId' }, corsHeaders, 400);
      }

      await this.env.DB.prepare('DELETE FROM messages WHERE session_id = ?').bind(sessionId).run();
      return this.jsonResponse({ success: true, message: 'History deleted' }, corsHeaders);
    } catch (error) {
      console.error('Delete error:', error);
      return this.jsonResponse(
        { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
        corsHeaders,
        500
      );
    }
  }

  private async saveMessage(sessionId: string, role: string, content: string): Promise<void> {
    try {
      await this.env.DB.prepare(
        'INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)'
      ).bind(sessionId, role, content).run();
    } catch (error) {
      console.error('Error saving message:', error);
    }
  }

  private async getMessages(sessionId: string): Promise<Message[]> {
    try {
      const { results } = await this.env.DB.prepare(
        'SELECT role, content, timestamp FROM messages WHERE session_id = ? ORDER BY timestamp ASC'
      ).bind(sessionId).all();

      return results.map(r => ({
        role: r.role as 'user' | 'assistant',
        content: r.content as string,
        timestamp: r.timestamp as string,
      }));
    } catch (error) {
      console.error('Error getting messages:', error);
      return [];
    }
  }

  private handleFrontend(corsHeaders: HeadersInit): Response {
    const htmlContent = this.getHTML();
    return new Response(htmlContent, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  }

  private getHTML(): string {
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
body { overflow: hidden; }
.msg-slide { animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
@keyframes slideUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
.typing-dot { animation: bounce 1.4s infinite; }
.typing-dot:nth-child(2) { animation-delay: 0.2s; }
.typing-dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes bounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-8px); } }
.gradient-bg { background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%); }
.glass { background: rgba(255,255,255,0.95); backdrop-filter: blur(10px); border: 1px solid rgba(226,232,240,0.8); }
.feature-card { transition: all 0.3s ease; cursor: pointer; }
.feature-card:hover { transform: translateY(-8px); box-shadow: 0 20px 40px rgba(59,130,246,0.3); }
.feature-card:hover .feature-icon { transform: scale(1.15) rotate(5deg); }
.feature-icon { transition: transform 0.3s ease; }
.tech-badge { transition: all 0.2s ease; }
.tech-badge:hover { transform: scale(1.08); }
textarea::-webkit-scrollbar { width: 6px; }
textarea::-webkit-scrollbar-thumb { background: #cbd5e0; border-radius: 3px; }
</style>
</head>
<body class="gradient-bg">
<div class="flex flex-col h-screen">
<header class="glass shadow-lg">
<div class="px-8 py-4">
<div class="flex items-center justify-between">
<div class="flex items-center gap-4">
<div class="bg-gradient-to-r from-blue-600 to-indigo-600 p-2.5 rounded-xl shadow-md">
<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
</svg>
</div>
<div>
<h1 class="text-2xl font-bold text-gray-900">AI Chat Assistant</h1>
<div class="flex items-center gap-2 text-sm">
<span class="flex items-center gap-1.5">
<span class="w-2 h-2 bg-green-500 rounded-full"></span>
<span class="text-gray-600 font-medium">Online</span>
</span>
<span class="text-gray-400">•</span>
<span class="text-gray-600 font-medium" id="title">Ready</span>
</div>
</div>
</div>
<div class="flex items-center gap-2">
<div class="bg-gray-100 px-3 py-2 rounded-lg">
<span class="text-gray-900 font-bold" id="count">0</span>
</div>
<button id="newBtn" class="tech-badge bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded-lg">
<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
</svg>
</button>
<button id="clrBtn" class="tech-badge bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-lg">
<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
</svg>
</button>
</div>
</div>
</div>
</header>
<div class="bg-white border-b p-2">
<div class="flex justify-center gap-4 text-sm">
<div class="tech-badge bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg font-medium" title="Llama 3.3 70B">
<span class="flex items-center gap-1.5">
<svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
Llama 3.3 70B
</span>
</div>
<div class="tech-badge bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg font-medium" title="D1 Database">
<span class="flex items-center gap-1.5">
<svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
D1 Database
</span>
</div>
<div class="tech-badge bg-purple-50 text-purple-700 px-3 py-1.5 rounded-lg font-medium" title="Durable Objects">
<span class="flex items-center gap-1.5">
<svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
Durable Objects
</span>
</div>
<div class="tech-badge bg-green-50 text-green-700 px-3 py-1.5 rounded-lg font-medium" title="Zero APIs">
<span class="flex items-center gap-1.5">
<svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
Zero APIs
</span>
</div>
</div>
</div>
<div id="msgBox" class="flex-1 overflow-auto px-8 py-8">
<div id="msgs"></div>
<div id="welcome" class="flex items-center justify-center h-full">
<div class="text-center max-w-4xl">
<div class="w-20 h-20 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-xl">
<svg class="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
</svg>
</div>
<h2 class="text-5xl font-bold text-gray-900 mb-3">Hello! 👋</h2>
<p class="text-xl text-gray-600 font-medium mb-12">How can I help you today?</p>
<div class="grid grid-cols-2 gap-5 max-w-3xl mx-auto">
<div class="feature-card glass p-6 rounded-2xl group">
<div class="feature-icon text-4xl mb-3">💡</div>
<div class="font-bold text-gray-900 text-lg mb-2">Ask Anything</div>
<div class="text-sm text-gray-600">Get instant AI-powered answers</div>
                <div class="mt-3 text-xs text-blue-600 font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
Try: Explain quantum computing
</div>
</div>
<div class="feature-card glass p-6 rounded-2xl group">
<div class="feature-icon text-4xl mb-3">🚀</div>
<div class="font-bold text-gray-900 text-lg mb-2">Lightning Fast</div>
<div class="text-sm text-gray-600">Edge computing responses</div>
<div class="mt-3 text-xs text-blue-600 font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
Powered by global network
</div>
</div>
<div class="feature-card glass p-6 rounded-2xl group">
<div class="feature-icon text-4xl mb-3">💾</div>
<div class="font-bold text-gray-900 text-lg mb-2">Auto-Saved</div>
<div class="text-sm text-gray-600">Never lose a conversation</div>
<div class="mt-3 text-xs text-blue-600 font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
Stored in D1 Database
</div>
</div>
<div class="feature-card glass p-6 rounded-2xl group">
<div class="feature-icon text-4xl mb-3">🔒</div>
<div class="font-bold text-gray-900 text-lg mb-2">100% Private</div>
<div class="text-sm text-gray-600">No external APIs</div>
<div class="mt-3 text-xs text-blue-600 font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
All on Cloudflare platform
</div>
</div>
</div>
<div class="mt-10 glass p-5 rounded-xl inline-block">
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
<div class="glass border-t border-gray-200 shadow-xl">
<div class="px-8 py-5">
<div class="flex gap-3 items-end">
<textarea id="inp" rows="1" placeholder="Message AI Assistant..." 
class="flex-1 px-5 py-3 bg-white border-2 border-gray-300 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 text-base resize-none transition-all shadow-sm" style="max-height:150px"></textarea>
<button id="snd" class="px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all">
<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
</svg>
</button>
</div>
<div class="flex justify-between mt-3">
<div class="flex gap-2 text-xs text-gray-600">
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
console.log('Script loading...');
var sid=localStorage.getItem('sid')||'s_'+Date.now();
localStorage.setItem('sid',sid);
var hist=[];
var cnt=0;
function send(){
console.log('SEND CALLED!');
var inp=document.getElementById('inp');
var m=inp.value.trim();
if(!m)return;
document.getElementById('welcome').style.display='none';
var d1=document.createElement('div');
d1.className='msg-slide flex justify-end mb-6';
d1.innerHTML='<div class="px-6 py-4 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg"><div class="font-semibold text-sm mb-2">You</div><div>'+m+'</div></div>';
document.getElementById('msgs').appendChild(d1);
inp.value='';
document.getElementById('snd').disabled=true;
fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:m,sessionId:sid,conversationHistory:hist})})
.then(function(r){return r.json();})
.then(function(d){
if(d.success){
var txt=d.message.content.replace(/\*\*/g,'').replace(/\*/g,'');
var d2=document.createElement('div');
d2.className='msg-slide flex justify-start mb-6';
d2.innerHTML='<div class="px-6 py-4 rounded-2xl glass shadow-lg"><div class="font-semibold text-sm mb-2">AI</div><div id="typ"></div></div>';
document.getElementById('msgs').appendChild(d2);
var tp=d2.querySelector('#typ');
var ws=txt.split(' ');
var i=0;
var iv=setInterval(function(){
if(i<ws.length){
tp.textContent+=(i>0?' ':'')+ws[i];
document.getElementById('msgBox').scrollTop=999999;
i++;
}else{clearInterval(iv);}
},30);
hist.push({role:'user',content:m});
hist.push({role:'assistant',content:txt});
cnt+=2;
document.getElementById('count').textContent=cnt;
var f=hist[0].content.substring(0,40);
document.getElementById('title').textContent=f+(hist[0].content.length>40?'...':'');
}
document.getElementById('snd').disabled=false;
document.getElementById('msgBox').scrollTop=999999;
})
.catch(function(){document.getElementById('snd').disabled=false;});
}
document.getElementById('snd').onclick=function(){
console.log('Button clicked!');
send();
};
document.getElementById('inp').onkeydown=function(e){
console.log('Key:', e.key, 'Shift:', e.shiftKey);
if(e.key==='Enter'&&!e.shiftKey){
console.log('Sending via Enter!');
e.preventDefault();
send();
}
};
document.getElementById('clrBtn').onclick=function(){
if(confirm('Delete?')){
fetch('/api/history?sessionId='+sid,{method:'DELETE'});
document.getElementById('msgs').innerHTML='';
hist=[];
cnt=0;
document.getElementById('count').textContent='0';
document.getElementById('welcome').style.display='flex';
document.getElementById('title').textContent='Ready';
}
};
document.getElementById('newBtn').onclick=function(){
sid='s_'+Date.now();
localStorage.setItem('sid',sid);
location.reload();
};
document.getElementById('inp').oninput=function(){
this.style.height='auto';
this.style.height=Math.min(this.scrollHeight,150)+'px';
};
fetch('/api/history?sessionId='+sid)
.then(function(r){return r.json();})
.then(function(d){
if(d.success&&d.messages&&d.messages.length>0){
document.getElementById('welcome').style.display='none';
hist=d.messages;
cnt=d.messages.length;
d.messages.forEach(function(m){
var dv=document.createElement('div');
dv.className='flex mb-6 '+(m.role==='user'?'justify-end':'justify-start');
dv.innerHTML='<div class="px-6 py-4 rounded-2xl shadow-lg '+(m.role==='user'?'bg-gradient-to-br from-blue-600 to-indigo-600 text-white':'glass')+'"><div class="font-semibold text-sm mb-2">'+(m.role==='user'?'You':'AI')+'</div><div>'+m.content+'</div></div>';
document.getElementById('msgs').appendChild(dv);
});
document.getElementById('count').textContent=cnt;
if(hist.length>0){
document.getElementById('title').textContent=hist[0].content.substring(0,40);
}
}
});
console.log('Script loaded! Type send() to test');
</script>
</body>
</html>`;
  }

  private jsonResponse(data: any, corsHeaders: HeadersInit, status: number = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  }

  private getCorsHeaders(): HeadersInit {
    return {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
  }
}

export function createServer(env: Env): Server {
  return new Server(env);
}