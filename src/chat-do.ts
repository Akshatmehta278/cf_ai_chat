import { ChatAgent } from "./agent";
import { AgentDO } from "agents";

export class Chat extends AgentDO {
  constructor(state: DurableObjectState, env: any) {
    super(state, env, ChatAgent);
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/chat" && req.method === "POST") {
      const body = await req.json();
      const result = await this.agent.respond(body.message);
      return Response.json(result);
    }

    if (url.pathname === "/analyze" && req.method === "POST") {
      const body = await req.json();
      const result = await this.agent.analyzeWebsite(body.url);
      return Response.json(result);
    }

    return new Response("Not found", { status: 404 });
  }
}
