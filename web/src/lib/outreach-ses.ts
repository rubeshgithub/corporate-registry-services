import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

/**
 * SES wrapper dedicated to outreach. Uses a separate configuration set from
 * transactional email so bounce / complaint reputation on outreach can't
 * bleed into order-confirmation deliverability.
 *
 * Requires (all beyond the shared AWS creds):
 *   SES_OUTREACH_CONFIG_SET   — configuration set name, created in AWS SES console
 *   SES_OUTREACH_FROM         — the "From:" address (must be a verified identity)
 *
 * Reply-To is set separately so replies go to the human support inbox even
 * when the From: is a persona@ subdomain address.
 */

const OUTREACH_REPLY_TO = process.env.SES_OUTREACH_REPLY_TO ?? "support@corporateregistryservices.ca";

function client(): SESClient {
  return new SESClient({
    region: process.env.AWS_REGION ?? "us-east-1",
    credentials: {
      accessKeyId:     process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
}

export type SendResult = {
  ok:            boolean;
  sesMessageId?: string;
  error?:        string;
};

export async function sendOutreach({
  to, cc, bcc, subject, html, text,
}: {
  to:      string[];
  cc:      string[];
  bcc:     string[];
  subject: string;
  html:    string;
  text:    string;
}): Promise<SendResult> {
  const from       = process.env.SES_OUTREACH_FROM;
  const configSet  = process.env.SES_OUTREACH_CONFIG_SET;
  if (!from) return { ok: false, error: "SES_OUTREACH_FROM is not set." };
  if (!configSet) {
    // Not fatal — we can still send without a config set — but log so ops knows.
    console.warn("[outreach-ses] SES_OUTREACH_CONFIG_SET is not set; sending without an isolated reputation.");
  }
  if (!to.length) return { ok: false, error: "No recipient." };

  try {
    const res = await client().send(new SendEmailCommand({
      Source:      `${process.env.OUTREACH_PERSONA_NAME ?? "Alex Morgan"} <${from}>`,
      Destination: {
        ToAddresses:  to,
        CcAddresses:  cc.length ? cc : undefined,
        BccAddresses: bcc.length ? bcc : undefined,
      },
      ReplyToAddresses: [OUTREACH_REPLY_TO],
      Message: {
        Subject: { Data: subject, Charset: "UTF-8" },
        Body: {
          Html: { Data: html, Charset: "UTF-8" },
          Text: { Data: text, Charset: "UTF-8" },
        },
      },
      ConfigurationSetName: configSet,
    }));
    return { ok: true, sesMessageId: res.MessageId };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "SES send failed.";
    return { ok: false, error: msg };
  }
}
