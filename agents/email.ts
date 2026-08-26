// Email, because suppliers are not on LINE.
//
// A customer messages the company on LINE and gets answered there. A supplier
// gets an RFQ by email, like every other forwarder and trading company on
// earth. Until this existed, an approved RFQ was a draft the operator had to
// copy out by hand, which is the kind of gap that makes a product a demo.
//
// Sends through Resend when configured. Without a key it does not pretend:
// the send is recorded as queued, the operator is told, and the draft is on
// the dashboard to copy. Never claim something left the building when it did
// not.

export interface EmailResult {
  sent: boolean;
  detail: string;
}

export async function sendEmail(args: {
  to: string;
  subject: string;
  body: string;
}): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!key || !from) {
    return {
      sent: false,
      detail: "email not configured (set RESEND_API_KEY and EMAIL_FROM) — draft is ready to copy",
    };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        from,
        to: [args.to],
        subject: args.subject.slice(0, 200),
        text: args.body,
      }),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200);
      return { sent: false, detail: `email provider rejected it (${res.status}): ${detail}` };
    }
    const j = await res.json();
    return { sent: true, detail: `emailed ${args.to} (id ${j.id ?? "unknown"})` };
  } catch (err) {
    return { sent: false, detail: `email failed: ${String(err).slice(0, 150)}` };
  }
}

/** A subject line the recipient will actually recognise. */
export function subjectFor(title: string, reference?: string | null): string {
  const ref = reference ? ` [${reference}]` : "";
  return `${title}${ref}`;
}
