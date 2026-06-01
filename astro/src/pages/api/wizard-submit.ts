export const prerender = false;

import type { APIRoute } from 'astro';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { randomBytes } from 'crypto';

const ses = new SESClient({ region: process.env.AWS_REGION ?? 'ca-central-1' });
const FROM   = process.env.SES_FROM    ?? 'support@corporateregistryservices.ca';
const NOTIFY = process.env.NOTIFY_EMAIL ?? 'support@corporateregistryservices.ca';

function makeRef(): string {
  return 'D10-' + randomBytes(3).toString('hex').toUpperCase();
}

function formatDetails(details: Record<string, any>): string {
  return Object.entries(details)
    .filter(([, v]) => v !== undefined && v !== '' && v !== false && v !== null)
    .map(([k, v]) => {
      const key = k.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
      if (typeof v === 'boolean') return `  ${key}: Yes`;
      if (Array.isArray(v)) return `  ${key}: ${v.length} item(s)`;
      return `  ${key}: ${v}`;
    })
    .join('\n');
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { bucketKey, serviceKeys, jurisdictionKey, details, customer } = body;
    const ref = makeRef();

    console.log('[wizard-submit] ref:', ref, '| bucket:', bucketKey, '| services:', serviceKeys, '| customer:', customer?.email);

    const serviceLines = (serviceKeys as string[]).map((k: string) => {
      const svcDetails = details?.[k] ?? {};
      const detailText = Object.keys(svcDetails).length > 0 ? '\n' + formatDetails(svcDetails) : ' (no additional details)';
      return `  • ${k}${detailText}`;
    }).join('\n');

    const ownerBody = [
      `New wizard order received — docu10`,
      `Reference: ${ref}`,
      ``,
      `── Request ────────────────────────────────`,
      `Category:     ${bucketKey ?? '—'}`,
      `Services:`,
      serviceLines,
      `Jurisdiction: ${jurisdictionKey ?? '—'}`,
      ``,
      `── Contact ────────────────────────────────`,
      `Name:     ${customer?.fullName ?? '—'}`,
      `Email:    ${customer?.email ?? '—'}`,
      `Phone:    ${customer?.phone ?? '—'}`,
      `Company:  ${customer?.company || '—'}`,
      `Preferred: ${customer?.preferredContact ?? '—'}`,
      ``,
      `Reply-To: ${customer?.email ?? ''}`,
    ].join('\n');

    await ses.send(new SendEmailCommand({
      Source: FROM,
      Destination: { ToAddresses: [NOTIFY] },
      Message: {
        Subject: { Data: `[docu10] New Order ${ref} — ${bucketKey} from ${customer?.fullName ?? 'Customer'}` },
        Body: { Text: { Data: ownerBody } },
      },
      ReplyToAddresses: customer?.email ? [customer.email] : [],
    }));

    if (customer?.email) {
      const customerBody = [
        `Hi ${customer.fullName ?? 'there'},`,
        ``,
        `Thank you for your order with docu10. We've received your request and will confirm within 1 business hour.`,
        ``,
        `Your reference number is: ${ref}`,
        ``,
        `── What you ordered ───────────────────────`,
        `Category:     ${bucketKey ?? '—'}`,
        `Services:     ${(serviceKeys as string[]).join(', ')}`,
        `Jurisdiction: ${jurisdictionKey ?? '—'}`,
        ``,
        `If you have any questions, reply to this email or contact us at ${NOTIFY}.`,
        ``,
        `— The docu10 Team`,
        `corporateregistryservices.ca`,
      ].join('\n');

      await ses.send(new SendEmailCommand({
        Source: FROM,
        Destination: { ToAddresses: [customer.email] },
        Message: {
          Subject: { Data: `Your docu10 Order is Confirmed — ${ref}` },
          Body: { Text: { Data: customerBody } },
        },
      }));
    }

    return new Response(JSON.stringify({ ref }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[wizard-submit] error:', err?.name, err?.message, err?.$metadata);
    return new Response(JSON.stringify({ message: 'Failed to submit order. Please try again.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
