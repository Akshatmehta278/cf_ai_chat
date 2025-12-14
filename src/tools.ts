import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { getCurrentAgent } from "agents";
import { scheduleSchema } from "agents/schedule";
import type { Chat } from "./server";

export const analyzeWebsite = tool({
  description: "Fetch website HTML and audit for performance/security/accessibility.",
  inputSchema: z.object({
    url: z.string().url("Must be a valid URL including https://")
  }),
  execute: async ({ url }) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);

    const html = await response.text();
    const limit = 8000;

    return {
      url,
      truncated: html.length > limit,
      html: html.slice(0, limit)
    };
  }
});

export const scheduleAudit = tool({
  description: "Schedule a future website audit.",
  inputSchema: scheduleSchema,
  execute: async ({ when, description }) => {
    const { agent } = getCurrentAgent<Chat>();
    if (!agent) throw new Error("No agent context");

    let scheduleInput;

    switch (when.type) {
      case "scheduled":
        scheduleInput = when.date;
        break;
      case "delayed":
        scheduleInput = when.delayInSeconds;
        break;
      case "cron":
        scheduleInput = when.cron;
        break;
      default:
        return "Invalid schedule.";
    }

    agent.schedule(scheduleInput, "executeTask", description);
    return `Audit scheduled (${when.type}): ${description}`;
  }
});

export const getScheduledAudits = tool({
  description: "List all scheduled tasks",
  inputSchema: z.object({}),
  execute: async () => {
    const { agent } = getCurrentAgent<Chat>();
    if (!agent) throw new Error("No agent context");

    const tasks = agent.getSchedules();
    if (!tasks || tasks.length === 0) return "No scheduled tasks.";

    return tasks;
  }
});

export const tools = {
  analyzeWebsite,
  scheduleAudit,
  getScheduledAudits
} satisfies ToolSet;

export const executions = {};
