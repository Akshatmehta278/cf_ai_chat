export interface Env {
  Chat: DurableObjectNamespace;
}

export { Chat } from "./chat-do";

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/") {
      return Response.json({
        ok: true,
        message: "Cloudflare AI Agent is running!",
      });
    }

    const id = env.Chat.idFromName("global-agent");
    const stub = env.Chat.get(id);

    // Chat
    if (url.pathname === "/agent/chat") {
      return stub.fetch("https://internal/chat", {
        method: "POST",
        body: await req.text(),
      });
    }

    // Analysis
    if (url.pathname === "/agent/analyze") {
      return stub.fetch("https://internal/analyze", {
        method: "POST",
        body: await req.text(),
      });
    }

    return new Response("Not found", { status: 404 });
  },
};
