import type OpenAI from "openai";

export const ONBOARDING_TOOLS: OpenAI.Responses.Tool[] = [
  {
    type: "function",
    name: "write_message",
    strict: false,
    description: "Write the onboarding message for the current question. Return only the message text.",
    parameters: {
      type: "object",
      properties: {
        message: { type: "string", description: "The friendly 1-2 sentence message to show the user." },
      },
      required: ["message"],
      additionalProperties: false,
    },
  },
];
