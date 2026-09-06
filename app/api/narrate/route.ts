import OpenAI from "openai";

const MODEL = "gpt-4o-mini";
const MAX_TOKENS = 150;
const MAX_HISTORY = 20; // ignore anything longer, the prompt doesn't need it

const SYSTEM = `You are the play-by-play commentator for a live blockchain activity monitor watching Base mainnet.

Given the current activity reading and the recent trend, write ONE or TWO short sentences describing what the chain is doing right now. Rules:
- Punchy sports-commentary energy. Present tense. Talk about the chain, not the numbers on a dashboard.
- Lead with the movement (a spike, a lull, a steady grind), then one bit of colour about what it might mean — DeFi flow, a quiet stretch, traders waking up.
- The percentage change is always fair game, at any size. Quote it whenever it reads naturally, small moves included: "inching up 2%" beats "a slight uptick".
- Separately: when the move is larger than 20% in either direction, that number leads the sentence instead of an adjective. Vary how you get there — these are two different shapes, not templates to fill in:
    Activity is up 113% in the last few readings, traders piling in.
    A sharp move here, gas usage climbing 70% in minutes.
- Vary the opening. Do not start with the word "Activity" more than occasionally. Open on the number itself, on the pace or the mood, or on what traders are doing — the subject does not have to come first.
- Never invent specifics you were not given: no token names, no dollar amounts, no block numbers, no wallet counts.
- Under 30 words. No preamble, no quotation marks, no emoji. Output only the line itself.`;

// Rotated per call so the model can't settle into one opening template.
// This lives in the user message rather than SYSTEM precisely because it has
// to vary call to call.
const OPENERS = [
  "Open on the number or percentage move itself.",
  "Open on the pace or momentum, not the raw number.",
  "Open on what traders and users are doing.",
  "Open on the chain's overall mood or feel.",
];

type NarrateRequest = {
  activityLevel: number;
  label: string;
  recentValues: number[];
};

/** Trust boundary: this is a public POST endpoint, so nothing is assumed. */
function parseBody(raw: unknown): NarrateRequest | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { activityLevel, label, recentValues } = raw as Record<string, unknown>;
  if (typeof activityLevel !== "number" || !Number.isFinite(activityLevel)) return null;
  if (activityLevel < 0 || activityLevel > 100) return null;
  if (typeof label !== "string" || label.length > 64) return null;
  if (!Array.isArray(recentValues)) return null;
  const values = recentValues
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
    .slice(-MAX_HISTORY);
  return { activityLevel, label, recentValues: values };
}

function describeTrend({ activityLevel, label, recentValues }: NarrateRequest) {
  const first = recentValues[0];
  const lines = [
    `Current activity level: ${activityLevel}/100 (${label}).`,
    `Recent readings, oldest to newest: ${recentValues.join(", ") || "none yet"}.`,
  ];
  if (typeof first === "number" && recentValues.length > 1) {
    const delta = activityLevel - first;
    const pct = first > 0 ? Math.round((delta / first) * 100) : null;
    lines.push(
      `Change across that window: ${delta >= 0 ? "+" : ""}${delta} points${
        pct === null ? "" : ` (${pct >= 0 ? "+" : ""}${pct}%)`
      }.`,
    );
  }
  return lines.join("\n");
}

async function narrate(reading: NarrateRequest) {
  const opener = OPENERS[Math.floor(Math.random() * OPENERS.length)];
  // Reads OPENAI_API_KEY from the environment.
  const client = new OpenAI();
  const response = await client.chat.completions.create({
    model: MODEL,
    max_completion_tokens: MAX_TOKENS,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: `${describeTrend(reading)}\n\n${opener}` },
    ],
  });
  return response.choices[0]?.message?.content?.trim() ?? "";
}

export async function POST(request: Request) {
  const reading = parseBody(await request.json().catch(() => null));
  if (!reading) {
    return Response.json({ error: "Bad payload" }, { status: 400 });
  }

  // ─── x402 payment gate goes here (phase 4) ───────────────────────────────
  // Charge for the narration before spending a token on it, and 402 out if
  // the payment header is missing or unsettled. Nothing below needs to change.

  // ─── ENS identity lookup goes here (phase 4) ─────────────────────────────
  // Resolve the narrator's name, then pass it into narrate() so the persona
  // can introduce itself. Purely additive to the system prompt.

  try {
    const narration = await narrate(reading);
    if (!narration) throw new Error("empty narration");
    return Response.json({ narration });
  } catch (err) {
    // The client keeps showing its last narration, so a soft failure is fine.
    console.error("[narrate] LLM call failed:", err);
    const status = err instanceof OpenAI.APIError ? err.status : 502;
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: status ?? 502 });
  }
}
