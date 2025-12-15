
import { routeAgentRequest, type Schedule } from "agents";
import { getSchedulePrompt } from "agents/schedule";
import { AIChatAgent } from "agents/ai-chat-agent";
import {
  generateId,
  streamText,
  type StreamTextOnFinishCallback,
  stepCountIs,
  createUIMessageStream,
  convertToModelMessages,
  createUIMessageStreamResponse
} from "ai";
import { openai } from "@ai-sdk/openai";
import { processToolCalls, cleanupMessages } from "./utils";
import { tools, executions } from "./tools";

const model = openai("gpt-4o-mini");

export class Chat extends AIChatAgent {
  async onChatMessage(onFinish: StreamTextOnFinishCallback) {
    const allTools = { ...tools, ...this.mcp.getAITools() };

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const cleaned = cleanupMessages(this.messages);
        const processed = await processToolCalls({
          messages: cleaned,
          dataStream: writer,
          tools: allTools,
          executions
        });

        const systemPrompt = `
You are WebPerfCoach — analyze websites for performance, security, accessibility.
${getSchedulePrompt({ date: new Date() })}
        `.trim();

        const result = streamText({
          system: systemPrompt,
          messages: convertToModelMessages(processed),
          model,
          tools: allTools,
          onFinish: onFinish as any,
          stopWhen: stepCountIs(10)
        });

        writer.merge(result.toUIMessageStream());
      }
    });

    return createUIMessageStreamResponse({ stream });
  }

  async executeTask(description: string, _task: Schedule) {
    await this.saveMessages([
      ...this.messages,
      {
        id: generateId(),
        role: "user",
        parts: [{ type: "text", text: `Running scheduled audit: ${description}` }],
        metadata: { createdAt: new Date() }
      }
    ]);
  }
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext) {
    return (await routeAgentRequest(req, env)) || new Response("Not found", { status: 404 });
  }
};
