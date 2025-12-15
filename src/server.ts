import { AgentNamespace } from "agents";
import { ChatAgent } from "./agent";
import type { Chat } from "./chat-do";

export interface Env {
  Chat: DurableObjectNamespace<Chat>;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/") {
      return Response.json({ ok: true, message: "REST Agent is running successfully!" });
    }

    const ns = new AgentNamespace(ChatAgent, env.Chat);
    const agent = ns.get("global");

    if (url.pathname === "/agent/chat" && req.method === "POST") {
      const body = await req.json();
      return Response.json(await agent.respond(body.message));
    }

    if (url.pathname === "/agent/analyze" && req.method === "POST") {
      const body = await req.json();
      return Response.json(await agent.analyzeWebsite(body.url));
    }

    return new Response("Not found", { status: 404 });
  }
};
