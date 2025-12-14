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

// You can switch later to Workers AI
const model = openai("gpt-4o-mini");

export class Chat extends AIChatAgent {
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback,
    _options?: { abortSignal?: AbortSignal }
  ) {
    const allTools = { ...tools, ...this.mcp.getAITools() };

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const cleanedMessages = cleanupMessages(this.messages);

        const processedMessages = await processToolCalls({
          messages: cleanedMessages,
          dataStream: writer,
          tools: allTools,
          executions
        });

        const systemPrompt = `
You are WebPerfCoach — an AI agent that audits website URLs for:
1. Performance
2. Security hygiene
3. Accessibility

When user sends a URL:
- Use "analyzeWebsite" tool to fetch HTML
- Then return:
  - Summary (3 lines)
  - Performance checklist
  - Security checklist
  - Accessibility checklist
  - Optional fixes

If user asks to check later, call "scheduleAudit".

If HTML is truncated, tell user.

${getSchedulePrompt({ date: new Date() })}
        `.trim();

        const result = streamText({
          system: systemPrompt,
          messages: convertToModelMessages(processedMessages),
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
  async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
};
