/**
 * The same alerts as the owner's text messages, posted to a Microsoft Teams
 * channel (or chat) through a Teams Workflow webhook.
 *
 * Setup (Teams): in the channel → ••• → Workflows → "Post to a channel when a
 * webhook request is received" → pick the team and channel → copy the URL it
 * gives → set TEAMS_WEBHOOK_URL on Render. (Microsoft retired the old
 * "Incoming Webhook" connector; Workflows is its replacement.)
 * Several destinations (a channel and a chat with a person, say): put each
 * workflow's URL in TEAMS_WEBHOOK_URL separated by commas or spaces — every
 * alert goes to all of them. For a chat, use the "Send webhook alerts to a
 * chat" workflow and pick the chat.
 * Unset = nothing is posted. SMS_ENABLED=0 stops the texts but not Teams.
 *
 * The message is an Adaptive Card: a bold first line, the rest underneath, and
 * a button to docu10. Failures are logged and never block the caller.
 */
export async function sendTeamsAlert(text: string, opts: { title?: string; url?: string; urlLabel?: string } = {}): Promise<void> {
  const hooks = (process.env.TEAMS_WEBHOOK_URL ?? "").split(/[\s,]+/).map((u) => u.trim()).filter((u) => /^https:\/\//.test(u));
  if (!hooks.length) return;
  /* "CRS: Visitor on /order/x from y (desktop) - session abc" → title + detail. */
  const clean = text.replace(/^CRS:\s*/, "");
  const [head, ...tail] = clean.split(/\s+-\s+|\n/);
  const title = opts.title ?? head;
  const detail = opts.title ? clean : tail.join(" · ");
  const card = {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      { type: "TextBlock", text: "CRS", size: "Small", weight: "Bolder", color: "Accent", spacing: "None" },
      { type: "TextBlock", text: title.slice(0, 300), weight: "Bolder", wrap: true, spacing: "Small" },
      ...(detail ? [{ type: "TextBlock", text: detail.slice(0, 1000), wrap: true, isSubtle: true, spacing: "Small" }] : []),
      {
        type: "TextBlock", size: "Small", isSubtle: true, spacing: "Small",
        text: new Date().toLocaleString("en-CA", { timeZone: "America/Edmonton", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " (Calgary)",
      },
    ],
    actions: [{ type: "Action.OpenUrl", title: opts.urlLabel ?? "Open docu10", url: opts.url ?? "https://docu10.ca/leads/today" }],
  };
  const payload = JSON.stringify({ type: "message", attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", contentUrl: null, content: card }] });
  await Promise.all(hooks.map(async (hook, i) => {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 6000);
      const res = await fetch(hook, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, signal: ctl.signal });
      clearTimeout(t);
      if (!res.ok) console.warn(`[CRS] Teams alert #${i + 1} HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    } catch (e) {
      console.warn(`[CRS] Teams alert #${i + 1} failed:`, e instanceof Error ? e.message : e);
    }
  }));
}
