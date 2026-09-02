// The operator pages cost real money to hit.
//
// `uploadDocument` spends an OpenAI vision call per upload, and `joinPool` can
// end in a LINE push — and the push quota is finite (200 a month, and a
// rehearsal eats a handful). Both are Next server actions, which means they
// are callable by anyone who can reach the deployment, whether or not they
// ever loaded the page. On a public URL that is somebody else's bill.
//
// Same key as /dashboard rather than a second secret: one thing for the
// operator to carry, and the landing page already tells people the operator
// view is private.

/** True when the request carries the operator key. Unset key = closed, not open. */
export function hasDemoKey(key: string | null | undefined): boolean {
  const expected = process.env.DASHBOARD_KEY;
  if (!expected) return false;
  return typeof key === "string" && key === expected;
}

/** For server actions: the key travels in the form body from the gated page. */
export function formHasDemoKey(formData: FormData): boolean {
  return hasDemoKey(formData.get("demo_key") as string | null);
}

/** The field name the pages and actions agree on. */
export const DEMO_KEY_FIELD = "demo_key";
