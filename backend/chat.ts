import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY environment variable is required");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 3,
});

export async function getChatResponse(
  message: string,
  planData: any,
  rfpText: string,
  history: Array<{ role: "user" | "assistant"; content: string }>
) {
  const trimmedPlanData = planData?.finalStaffingPlan?.tasks 
    ? {
        finalStaffingPlan: {
          tasks: planData.finalStaffingPlan.tasks.map((task: any) => ({
            taskId: task.taskId,
            lcat: task.lcat,
            hours: task.hours,
            mathRationale: task.mathRationale,
            basis: task.basis
          }))
        }
      }
    : null;

  const systemMessage = `You are an AI assistant helping with staffing plans.

When a user requests changes to the staffing plan, follow these steps:
1. Parse the user's request carefully
2. Identify which tasks need modification
3. Update the values while maintaining data consistency

Your response MUST be in this exact format when making changes:
PLAN_UPDATE:
{
  "tasks": [
    {
      "taskId": "string",
      "lcat": "string",
      "hours": number,
      "mathRationale": "string",
      "basis": "string"
    }
  ]
}

[Your explanation of the changes made]

For all tasks in the plan that are not being modified, you must include them EXACTLY as they are in the current plan. DO NOT CHANGE THEM AT ALL!

Context:
${rfpText ? `1. RFP Text: ${rfpText.substring(0, 1000)}...` : ''}
${trimmedPlanData ? `2. Current Staffing Plan: ${JSON.stringify(trimmedPlanData, null, 2)}` : ''}`;

  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: systemMessage
    },
    ...history.slice(-5).map(msg => ({
      role: msg.role,
      content: msg.content || ""
    })),
    {
      role: "user",
      content: message || ""
    }
  ].filter(msg => msg.content != null && msg.content.trim() !== "");

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages,
      temperature: 0.2,
      max_tokens: 4000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return { message: "I'm sorry, I couldn't generate a response." };
    }

    if (content.includes('PLAN_UPDATE:')) {
      try {
        const updatePart = content.split('PLAN_UPDATE:')[1].trim();

        let bracketCount = 0;
        let jsonEndIndex = 0;

        for (let i = 0; i < updatePart.length; i++) {
          if (updatePart[i] === '{') bracketCount++;
          if (updatePart[i] === '}') {
            bracketCount--;
            if (bracketCount === 0) {
              jsonEndIndex = i + 1;
              break;
            }
          }
        }

        const jsonStr = updatePart.substring(0, jsonEndIndex);
        const explanation = updatePart.substring(jsonEndIndex).trim();

        console.log("Extracted JSON:", jsonStr);

        const updateData = JSON.parse(jsonStr);

        if (!updateData.tasks || !Array.isArray(updateData.tasks)) {
          throw new Error("Invalid update format - missing tasks array");
        }

        updateData.tasks.forEach((task: any, index: number) => {
          if (!task.taskId || !task.lcat || typeof task.hours !== 'number') {
            throw new Error(`Invalid task format at index ${index}`);
          }
        });

        const updatedPlan = {
          ...planData,
          finalStaffingPlan: {
            tasks: updateData.tasks
          }
        };

        return {
          message: explanation || "Plan updated successfully",
          updatedPlan
        };
      } catch (e) {
        console.error("Failed to parse plan update:", e);
        console.error("Raw content:", content);
        return { 
          message: "I understood your request to update the plan, but I need you to be more specific about what changes you want to make. Please specify which task(s) you want to modify and what values should be changed.",
          error: "Failed to parse plan update"
        };
      }
    }

    return { message: content };
  } catch (error: any) {
    console.error("Error getting chat response:", error);

    if (error.code === 'context_length_exceeded') {
      return {
        message: "I apologize, but the plan and conversation history are too long for me to process. Could you try breaking down your request into smaller parts?",
        error: "Message too long"
      };
    }

    throw new Error(`Failed to get AI response: ${error.message}`);
  }
} 