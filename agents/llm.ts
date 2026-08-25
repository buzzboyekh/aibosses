// One place the model is called, so swapping providers is a config change.
// Default is OpenAI because every participant gets event credits; the final
// choice is made after the Sep 4 sponsor bounty reveal.

export interface LlmDraft {
  title: string;   // one line, shown on the LINE card and in the queue
  body: string;    // the drafted content the owner is approving
  reason: string;  // why the agent drafted it this way
  missing?: string[]; // facts it needed and did not have
}

const SHAPE = `Reply with JSON only, no markdown fence:
{"title": string, "body": string, "reason": string, "missing": string[]}
- title: one short line naming the action
- body: the actual draft, ready for a human to approve and send
- reason: one sentence on why you drafted it this way
- missing: any fact you needed but were not given. Never invent these facts.`;

export async function callLlm(
  systemPrompt: string,
  contextBlock: string
): Promise<LlmDraft> {
  const system = `${systemPrompt}\n\n${SHAPE}`;
  // Whichever key is present wins; LLM_PROVIDER forces one. Anthropic is
  // checked first only because OpenAI event credits do not exist until Sep 4.
  const provider =
    process.env.LLM_PROVIDER ??
    (process.env.ANTHROPIC_API_KEY ? "anthropic" : "openai");
  return provider === "anthropic"
    ? callAnthropic(system, contextBlock)
    : callOpenAi(system, contextBlock);
}

async function callOpenAi(system: string, user: string): Promise<LlmDraft> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY missing");
  const model = process.env.LLM_MODEL ?? "gpt-4o-mini";

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  const raw = json.choices?.[0]?.message?.content;
  if (!raw) throw new Error("OpenAI returned no content");
  return parseDraft(raw);
}

async function callAnthropic(system: string, user: string): Promise<LlmDraft> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY missing");
  const model = process.env.LLM_MODEL ?? "claude-sonnet-4-5";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      temperature: 0.2,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  const raw = json.content?.[0]?.text;
  if (!raw) throw new Error("Anthropic returned no content");
  return parseDraft(raw);
}

/**
 * Models sometimes wrap JSON in a fence or add a sentence around it despite
 * being told not to. Recover instead of failing the whole draft.
 */
export function parseDraft(raw: string): LlmDraft {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  else {
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first !== -1 && last > first) text = text.slice(first, last + 1);
  }

  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error(`LLM did not return JSON: ${raw.slice(0, 200)}`);
  }

  const title = typeof obj.title === "string" ? obj.title.trim() : "";
  const body = typeof obj.body === "string" ? obj.body.trim() : "";
  const reason = typeof obj.reason === "string" ? obj.reason.trim() : "";
  if (!title || !body) throw new Error("LLM draft missing title or body");

  const missing = Array.isArray(obj.missing)
    ? obj.missing.filter((m): m is string => typeof m === "string")
    : [];

  return { title, body, reason: reason || "no reason given", missing };
}
