import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

// Update the model constants at the top of the file
const REASONING_MODEL = "gpt-4";
const PARSER_MODEL = "gpt-4";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY environment variable is required");
}

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 3,
  timeout: 180000, // 3 minutes
});

/**
 * Remove triple-backtick fences, code blocks, or leading/trailing parentheses.
 * This helps if the model wraps valid JSON in them. We won't do any forced 
 * bracket or quote additions here that might corrupt valid JSON.
 */
function sanitizePotentialFormatting(raw: string) {
  let cleaned = raw.replace(/```json/gi, "").replace(/```/g, "");
  cleaned = cleaned.replace(/^[()\s]+/, "").replace(/[()\s]+$/, "");
  return cleaned.trim();
}

/**
 * Attempt to parse `content` as JSON, or throw. If it fails,
 * we ask GPT to "repair" it by returning correct JSON. We retry up to `maxRetries`.
 *
 * - openaiClient: instance of OpenAI
 * - originalMessages: the conversation context (system+user instructions)
 * - content: the raw string from GPT that should be JSON
 * - maxRetries: how many times to attempt repairs
 *
 * Returns the parsed JSON object if successful.
 * Throws an error if repeated repairs fail or exceed `maxRetries`.
 */
async function parseJsonWithRetry(
  openaiClient: OpenAI,
  originalMessages: ChatCompletionMessageParam[],
  content: string,
  maxRetries = 2
): Promise<any> {
  let attempt = 0;
  let raw = sanitizePotentialFormatting(content);

  while (attempt <= maxRetries) {
    try {
      // Try straightforward JSON.parse
      return JSON.parse(raw);
    } catch (err) {
      attempt++;
      if (attempt > maxRetries) {
        console.error("Error parsing JSON, max retries exceeded:", err);
        console.error("Last raw content was:\n", raw);
        throw new Error("Failed to parse JSON (max retries exceeded)");
      }
      console.warn(`Parse attempt #${attempt} failed. Attempting a "repair" prompt...`);

      // Provide error + raw output back to GPT-4 to fix
      const repairResponse = await openaiClient.chat.completions.create({
        model: PARSER_MODEL,
        temperature: 0.0,
        messages: [
          ...originalMessages, // keep the same context (system instructions, etc.)
          {
            role: "system",
            content: `
Your last output had invalid JSON. Here is the error:
${String(err)}

Your invalid JSON was:
${raw}

Please respond ONLY with valid JSON, no code fences, no commentary. Output must match the schema previously described.`
          }
        ]
      });

      // Update raw output with the new attempt
      raw = sanitizePotentialFormatting(repairResponse.choices[0]?.message?.content || "");
      console.log(`--- REPAIR ATTEMPT #${attempt} RAW OUTPUT (GPT-4) ---\n`, raw);
    }
  }

  // Should never reach here
  throw new Error("Failed to parse JSON unexpectedly.");
}

/**
 * Generates a multi-level staffing plan in three steps:
 *   (1) Identify tasks/subTasks
 *   (2) Assign recommended labor categories
 *   (3) Provide hours estimates (top_down or bottom_up)
 *
 * We do two calls per step:
 *   A) gpt-4 for advanced reasoning (in free-form text)
 *   B) gpt-4 to parse that text into valid JSON
 */
export async function generateStaffingPlan(
  rfpText: string,
  approach: "top_down" | "bottom_up",
  totalFTE?: number
) {
  // =======================================
  // STEP 1
  // =======================================

  // (A) gpt-4 → free-form reasoning
  console.log('\n------- TEXT BEING SENT TO LLM -------\n', rfpText);
  
  const step1Raw = await openai.chat.completions.create({
    model: REASONING_MODEL,
    max_tokens: 10000,
    messages: [
      {
        role: "user",
        content: `
You are an AI that generates a detailed, multi-level staffing plan for Government contracting proposals.
We'll do this in 3 steps, but for now, just focus on STEP 1 and provide your reasoning in free-form text.

**STEP 1**:
- Identify all top-level tasks and subTasks from the RFP.
- Some tasks might have hierarchical references (like C.5.1 or Subtask 3.2.1).
- We'll parse your text into JSON afterward, so you don't need to strictly format it here.

In the final JSON, we plan to use this schema:
{
  "tasks": [
    {
      "taskId": string,
      "title": string,
      "description": string,
      "subTasks": [
        {
          "subTaskId": string,
          "title": string,
          "description": string
        }
      ]
    }
  ]
}

RFP TEXT:
-------------
${rfpText}
-------------
`
      }
    ]
  });

  // Console log the raw reasoning output from gpt-4
  console.log("--- STEP 1 RAW (gpt-4) ---\n", step1Raw.choices[0]?.message?.content || "");

  // (B) gpt-4 → parse to valid JSON
  const step1ParserPrompt: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `
You are a JSON parser. Return ONLY valid JSON—no code blocks, 
no triple backticks, no parentheses, and no extra commentary.
Strip out any markdown or code-fence formatting. The schema is:

{
  "tasks": [
    {
      "taskId": string,
      "title": string,
      "description": string,
      "subTasks": [
        {
          "subTaskId": string,
          "title": string,
          "description": string
        }
      ]
    }
  ]
}
`
    },
    {
      role: "user",
      content: step1Raw.choices[0]?.message?.content || ""
    }
  ];

  const step1Parsed = await openai.chat.completions.create({
    model: PARSER_MODEL,
    max_tokens: 16000,
    temperature: 0.2,
    messages: step1ParserPrompt
  });

  // Console log the raw parser output from gpt-4
  console.log("--- STEP 1 PARSER (gpt-4) ---\n", step1Parsed.choices[0]?.message?.content || "");

  const tasksStep1 = await parseJsonWithRetry(
    openai,
    step1ParserPrompt,
    step1Parsed.choices[0]?.message?.content || ""
  );

  // =======================================
  // STEP 2
  // =======================================

  // (A) gpt-4 → free-form text (LCAT assignment)
  const step2Raw = await openai.chat.completions.create({
    model: REASONING_MODEL,
    max_tokens: 10000,
    messages: [
      {
        role: "user",
        content: `
You are an AI continuing the same process (STEP 2 now).
We have the following tasks/subTasks from Step 1:

${JSON.stringify(tasksStep1, null, 2)}

**STEP 2**:
- Assign recommended labor categories (LCATs).
- If a task has subTasks, each subTask will eventually get recommendedLCATs.
- If a task has no subTasks, the task itself gets recommendedLCATs.

In the final JSON, we use:
{
  "tasks": [
    {
      "taskId": string,
      "title": string,
      "description": string,
      "subTasks": [
        {
          "subTaskId": string,
          "title": string,
          "description": string,
          "recommendedLCATs": [string]
        }
      ],
      "recommendedLCATs": [string]
    }
  ]
}

Please provide your reasoning in free-form text (no need to produce JSON here).
`
      }
    ]
  });

  // Console log the raw reasoning output from gpt-4
  console.log("--- STEP 2 RAW (gpt-4) ---\n", step2Raw.choices[0]?.message?.content || "");

  // (B) gpt-4 → parse the free-form text into JSON
  const step2ParserPrompt: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `
You are a JSON parser. The user will give free-form text describing tasks/subTasks and recommended labor categories.
Output ONLY valid JSON—no code blocks or triple backticks. The structure is:

{
  "tasks": [
    {
      "taskId": string,
      "title": string,
      "description": string,
      "subTasks": [
        {
          "subTaskId": string,
          "title": string,
          "description": string,
          "recommendedLCATs": [string]
        }
      ],
      "recommendedLCATs": [string]
    }
  ]
}

Return only valid JSON, no extra text or parentheses.
`
    },
    {
      role: "user",
      content: step2Raw.choices[0]?.message?.content || ""
    }
  ];

  const step2Parsed = await openai.chat.completions.create({
    model: PARSER_MODEL,
    max_tokens: 16000,
    temperature: 0.2,
    messages: step2ParserPrompt
  });

  // Console log the raw parser output from gpt-4
  console.log("--- STEP 2 PARSER (gpt-4) ---\n", step2Parsed.choices[0]?.message?.content || "");

  const tasksStep2 = await parseJsonWithRetry(
    openai,
    step2ParserPrompt,
    step2Parsed.choices[0]?.message?.content || ""
  );

  // =======================================
  // STEP 3
  // =======================================

  // (A) gpt-4 → Provide hours estimates in free-form text
  const step3Raw = await openai.chat.completions.create({
    model: REASONING_MODEL,
    max_tokens: 30000,
    messages: [
      {
        role: "user",
        content: `
You are an AI continuing the same process (STEP 3).
We have the tasks/subTasks + recommendedLCATs from Step 2:

${JSON.stringify(tasksStep2, null, 2)}

**STEP 3**:
- Provide final hours estimates at the subTask level if subTasks exist, else at the task level.
- Approach = "${approach}".
- If approach is "top_down", we have totalFTE = ${totalFTE || 0}.
-Assume 1880 hours per FTE unless the user provides a different value.
-The Program Manager should have a max of 1880 hours unless OCONUS
  - Convert totalFTE to hours, distribute among tasks/subTasks, then break down by labor categories.
  - Provide a very detailed "mathRationale" for each set of lcat and hours. This should look like 250 tickets x .5 hours per ticket = 125 hours.
- If approach is "bottom_up", derive hours from textual references, workload provided, or workload assumptions, provide "mathRationale" and "basis."

In the final JSON, we use:
{
  "tasks": [
    {
      "taskId": string,      // or subTaskId if it's a subTask
      "lcat": string,        // from recommendedLCATs
      "hours": number,
      "mathRationale": string,
      "basis": string
    }
  ]
}

Please provide your reasoning in free-form text. We'll parse it next.
`
      }
    ]
  });

  // Console log the raw reasoning output from gpt-4
  console.log("--- STEP 3 RAW (gpt-4) ---\n", step3Raw.choices[0]?.message?.content || "");

  // (B) gpt-4 → parse the final hours distribution to JSON
  const step3ParserPrompt: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `
You are a JSON parser. The user is providing free-form text describing final hours distribution.
Output ONLY valid JSON with this structure:

{
  "tasks": [
    {
      "taskId": string,   // or subTaskId if it's a subTask
      "lcat": string,     // from recommendedLCATs
      "hours": number,
      "mathRationale": string,
      "basis": string
    }
  ]
}

No code blocks, no triple backticks, no parentheses. Only valid JSON—no commentary.
`
    },
    {
      role: "user",
      content: step3Raw.choices[0]?.message?.content || ""
    }
  ];

  const step3Parsed = await openai.chat.completions.create({
    model: PARSER_MODEL,
    max_tokens: 16000,
    temperature: 0.2,
    messages: step3ParserPrompt
  });

  // Console log the raw parser output from gpt-4
  console.log("--- STEP 3 PARSER (gpt-4) ---\n", step3Parsed.choices[0]?.message?.content || "");

  const finalHours = await parseJsonWithRetry(
    openai,
    step3ParserPrompt,
    step3Parsed.choices[0]?.message?.content || ""
  );

  // =======================================
  // Final Return
  // =======================================
  return {
    step1Tasks: tasksStep1,
    step2TasksWithLCATs: tasksStep2,
    finalStaffingPlan: finalHours
  };
} 