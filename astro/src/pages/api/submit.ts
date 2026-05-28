export const prerender = false;

import type { APIRoute } from 'astro';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const ses = new SESClient({ region: import.meta.env.AWS_REGION ?? 'ca-central-1' });

const FROM    = import.meta.env.SES_FROM    ?? 'support@corporateregistryservices.ca';
const NOTIFY  = import.meta.env.NOTIFY_EMAIL ?? 'support@corporateregistryservices.ca';

const FORM_LABELS: Record<string, string> = {
  'order-profile-report':  'Corporate Profile Report Order',
  'order-good-standing':   'Certificate of Good Standing Order',
  'order-annual-return':   'Annual Return Order',
  'order-minute-book':     'Minute Book Order',
  'order-incorporation':   'Incorporation Order',
  'service-enquiry':       'Service Enquiry',
  'contact':               'Contact Form',
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const data   = await request.formData();
    const fields = Object.fromEntries(data.entries()) as Record<string, string>;

    const formName  = fields['form-name'] ?? 'contact';
    const label     = FORM_LABELS[formName] ?? formName;
    const name      = fields['name']  ?? 'Customer';
    const email     = fields['email'] ?? '';
    const province  = fields['province'] ?? '';

    // ── Notification to owner ─────────────────────────────
    const fieldLines = Object.entries(fields)
      .filter(([k]) => k !== 'form-name')
      .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
      .join('\n');

    await ses.send(new SendEmailCommand({
      Source: FROM,
      Destination: { ToAddresses: [NOTIFY] },
      Message: {
        Subject: { Data: `[CRS] New ${label}${province ? ` — ${province}` : ''} from ${name}` },
        Body: {
          Text: {
            Data: `New submission received on corporateregistryservices.ca\n\nForm: ${label}\n\n${fieldLines}\n\n---\nReply to: ${email}`,
          },
        },
      },
      ReplyToAddresses: email ? [email] : [],
    }));

    // ── Confirmation to customer ───────────────────────────
    if (email) {
      await ses.send(new SendEmailCommand({
        Source: FROM,
        Destination: { ToAddresses: [email] },
        Message: {
          Subject: { Data: 'Your order has been received — CRS Canada' },
          Body: {
            Text: {
              Data: `Hi ${name},\n\nThank you for reaching out to Corporate Registry Services.\n\nWe have received your request and our team will confirm receipt within 1 business hour. We will follow up by email with next steps or if we need any additional information.\n\nWhat you ordered: ${label}${province ? `\nJurisdiction: ${province}` : ''}\n\nIf you have any urgent questions, reply to this email or call us at +1 (587) 587-5878.\n\nBest regards,\nCRS — Corporate Registry Services\nsupport@corporateregistryservices.ca\ncorporateregistryservices.ca`,
            },
          },
        },
      }));
    }

    return new Response(null, {
      status: 302,
      headers: { Location: '/thank-you' },
    });
  } catch (err) {
    console.error('Form submission error:', err);
    return new Response(null, {
      status: 302,
      headers: { Location: '/thank-you?error=1' },
    });
  }
};
