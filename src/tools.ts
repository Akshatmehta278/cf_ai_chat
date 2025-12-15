
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { getCurrentAgent } from "agents";
import { scheduleSchema } from "agents/schedule";
import type { Chat } from "./server";

export const analyzeWebsite = tool({
  description: "Fetch and analyze website HTML.",
  inputSchema: z.object({ url: z.string().url() }),
  execute: async ({ url }) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}`);
    const html = await res.text();
    return { url, html: html.slice(0, 8000), truncated: html.length > 8000 };
  }
});

export const scheduleAudit = tool({
  description: "Schedule audit.",
  inputSchema: scheduleSchema,
  execute: async ({ when, description }) => {
    const { agent } = getCurrentAgent<Chat>();
    let input;
    if (when.type === "scheduled") input = when.date;
    if (when.type === "delayed") input = when.delayInSeconds;
    if (when.type === "cron") input = when.cron;
    agent.schedule(input!, "executeTask", description);
    return `Scheduled: ${description}`;
  }
});

export const getScheduledAudits = tool({
  description: "List audits.",
  inputSchema: z.object({}),
  execute: async () => {
    const { agent } = getCurrentAgent<Chat>();
    return agent.getSchedules() || [];
  }
});

export const tools = { analyzeWebsite, scheduleAudit, getScheduledAudits } satisfies ToolSet;
export const executions = {};
