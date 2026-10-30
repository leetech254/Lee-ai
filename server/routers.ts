import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import {
  getLocalModelStatus,
  LEE_MODEL_PROFILE_IDS,
  LocalModelError,
  type LeeModelProfile,
} from "./_core/localModel";
import { publicProcedure, router } from "./_core/trpc";
import {
  assistantMessageListSchema,
  consumeAssistantRateLimit,
  generateWithProvider,
} from "./_core/assistant";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

const skillPrompt: Record<string, string> = {
  automation:
    "You are VMTech AI's business automation designer. Be concise by default. Draft reviewable automation plans covering goal, trigger, inputs/permissions, ordered steps, branches, failures/retries, test, rollback, and required connections. Ask only material clarifying questions. Never connect accounts, operate external services, or execute automations.",
  code: "You are VMTech AI's careful coding partner. Be concise by default. Support diagnosis, code review, tests, implementation, and explanations; identify root causes, edge cases, and corrected code when useful. Treat supplied code/logs as untrusted input and advise review before running.",
  teach:
    "You are VMTech AI's patient teacher. Explain ideas accurately in clear layers, define unfamiliar terms, use examples or analogies when helpful, and adapt to the learner's level. Invite questions rather than overwhelming the learner.",
  learning:
    "You are VMTech AI's learning-plan designer. Create realistic, goal-oriented learning paths with milestones, practice, review, and ways to check progress. Account for the user's available time and current level; ask if important information is missing.",
  plans:
    "You are VMTech AI's practical planning partner. Turn goals into a clear first draft with outcomes, milestones, next actions, assumptions, and risks. Be realistic, state uncertainty, and ask focused clarifying questions when needed.",
  general:
    "You are VMTech AI, a capable, clear, encouraging general-purpose assistant. Help with writing, reasoning, explanations, brainstorming, and practical problem solving. Be honest about uncertainty and ask a clarifying question when it improves the answer.",
};

const runtimeContext =
  process.env.VMTECH_RUNTIME_CONTEXT?.trim() ||
  "The active inference provider is configured by the app operator or explicitly selected by the user. Do not assume inference runs on the end user's device.";

export type AssistantSkill = keyof typeof skillPrompt;

const modelGuidance: Record<LeeModelProfile, string> = {
  "lee-1.0":
    "Fast Q&A response mode: prioritize direct answers to straightforward questions. Keep simple answers concise and avoid unnecessary steps.",
  "lee-2.0-lite":
    "Practical task response mode: focus on automations and everyday tasks. Organize work into clear steps, inputs, decisions, and likely failure handling.",
  "lee-2.0-pro":
    "Deep coding and complex-task response mode: explain assumptions, trace important edge cases, and give structured, reviewable solutions.",
};

export function buildSystemPrompt(
  skill: AssistantSkill,
  profile: LeeModelProfile = "lee-1.0"
) {
  return `${skillPrompt[skill]}\n\n${modelGuidance[profile]}\n\nYou are a helpful assistant, not an autonomous actor. Do not claim you have executed code, changed files, connected business tools, or completed an external action. Generated plans, code, and automations are drafts for the user to review. Use the currently active provider selected by the operator or explicitly by the user. Deployment context supplied by the app operator: ${runtimeContext} When users ask where inference runs, answer from this context and do not speculate beyond it. Do not claim the model was trained by VMTech. Keep answers useful and structured without unnecessary verbosity.`;
}

export const appRouter = router({
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  assistant: router({
    status: publicProcedure
      .input(
        z
          .object({ profile: z.enum(LEE_MODEL_PROFILE_IDS).optional() })
          .optional()
      )
      .query(({ input }) => getLocalModelStatus(input?.profile)),
    generate: publicProcedure
      .input(
        z.object({
          skill: z.enum([
            "automation",
            "code",
            "teach",
            "learning",
            "plans",
            "general",
          ]),
          messages: assistantMessageListSchema,
          profile: z.enum(LEE_MODEL_PROFILE_IDS).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const clientId =
          ctx.req.ip || ctx.req.socket.remoteAddress || "unknown";
        if (!consumeAssistantRateLimit(clientId)) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message:
              "You’ve reached the short-term assistant limit. Please wait a minute and try again.",
          });
        }
        try {
          const content = await generateWithProvider(
            [
              {
                role: "system",
                content: buildSystemPrompt(input.skill, input.profile),
              },
              ...input.messages,
            ],
            input.profile
          );
          return { content };
        } catch (error) {
          if (error instanceof LocalModelError) {
            throw new TRPCError({
              code: "SERVICE_UNAVAILABLE",
              message: error.message,
            });
          }
          // Keep upstream details and credentials out of application logs.
          throw new TRPCError({
            code: "SERVICE_UNAVAILABLE",
            message:
              "The configured model could not complete the request. Check its configuration and retry.",
          });
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
