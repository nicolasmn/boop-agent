import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import {
  createAutomation,
  listAutomations,
  setAutomationEnabled,
  removeAutomation,
} from "../db/queries/automations.js";
import { availableIntegrations } from "./execution-agent.js";
import { nextRunFor, validateSchedule } from "./automations.js";

function randomId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createAutomationMcp(conversationId: string) {
  const integrationHint = availableIntegrations().join(", ") || "(none configured)";

  return createSdkMcpServer({
    name: "boop-automations",
    version: "0.1.0",
    tools: [
      tool(
        "create_automation",
        `Schedule a recurring task. The agent will run the task on the schedule and reply with the result.\n\nCron expressions (5 fields: min hour day-of-month month day-of-week). Examples:\n  "0 8 * * *"      \u2014 every day at 8am\n  "*/15 * * * *"   \u2014 every 15 minutes\n  "0 9 * * 1-5"    \u2014 weekdays at 9am\n  "0 18 * * 0"     \u2014 Sundays at 6pm\n\nUse this for anything the user says "every [time]" or "remind me" about.\nIntegrations available: ${integrationHint}`,
        {
          name: z.string().describe("Short label, e.g. 'morning email digest'."),
          schedule: z.string().describe("Cron expression (5 fields)."),
          task: z.string().describe("Specific task for the sub-agent \u2014 what to look up, draft, or summarize."),
          integrations: z.array(z.string()).optional().default([]).describe(
            "Integration names the sub-agent needs for this task. Pass [] for reminder-only automations that don't need external tools.",
          ),
          notify: z.boolean().optional().default(true).describe(
            "If true, send the result to this conversation when it runs.",
          ),
        },
        async (args) => {
          const validation = validateSchedule(args.schedule);
          if (!validation.valid) {
            return {
              content: [{ type: "text" as const, text: `Invalid cron expression: ${validation.error}` }],
            };
          }
          const automationId = randomId("auto");
          const nextRunAt = nextRunFor(args.schedule) ?? undefined;
          await createAutomation({
            automationId,
            name: args.name,
            task: args.task,
            integrations: args.integrations,
            schedule: args.schedule,
            conversationId,
            notifyConversationId: args.notify ? conversationId : undefined,
            nextRunAt,
          });
          const nextStr = nextRunAt ? new Date(nextRunAt).toLocaleString() : "unknown";
          return {
            content: [{ type: "text" as const, text: `Created automation ${automationId} "${args.name}" \u2014 next run: ${nextStr}.` }],
          };
        },
      ),

      tool(
        "list_automations",
        "List all automations for this conversation.",
        { enabledOnly: z.boolean().optional().default(false) },
        async (args) => {
          const all = await listAutomations(args.enabledOnly);
          const mine = all.filter((a) => a.conversationId === conversationId);
          if (mine.length === 0) {
            return { content: [{ type: "text" as const, text: "No automations." }] };
          }
          const lines = mine.map(
            (a) => `\u2022 [${a.automationId}] ${a.enabled ? "\u25cf" : "\u25cb"} "${a.name}" \u2014 ${a.schedule} \u2014 ${a.task}`,
          );
          return { content: [{ type: "text" as const, text: lines.join("\n") }] };
        },
      ),

      tool(
        "toggle_automation",
        "Enable or disable an automation by id.",
        { automationId: z.string(), enabled: z.boolean() },
        async (args) => {
          const ok = await setAutomationEnabled(args.automationId, args.enabled);
          return {
            content: [{ type: "text" as const, text: ok ? `Set ${args.automationId} enabled=${args.enabled}.` : "Not found." }],
          };
        },
      ),

      tool(
        "delete_automation",
        "Permanently remove an automation.",
        { automationId: z.string() },
        async (args) => {
          const ok = await removeAutomation(args.automationId);
          return {
            content: [{ type: "text" as const, text: ok ? `Deleted ${args.automationId}.` : "Not found." }],
          };
        },
      ),
    ],
  });
}
