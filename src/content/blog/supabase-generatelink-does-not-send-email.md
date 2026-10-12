---
title: "Supabase generateLink Doesn't Send Email: My Pastor Invites Never Arrived"
description: "Supabase invite link not working? auth.admin.generateLink returns the link and sends nothing. My SaaS threw it away, so new pastors never got access."
pubDate: 2026-10-12
tags: [architecture, bugs, indie-hacker]
project: eglise
---

If your Supabase invite link is not working, check one thing before you touch your email templates: are you calling `auth.admin.generateLink`? That function builds a magic link and hands it back to you. It does not send anything. In [Eglise en Ligne](https://egliseenligne.fr), my website platform for churches, I called it, ignored the return value, and shipped. Any pastor provisioned through that route got a church website and no way to log into it. The good news: the platform has not launched officially yet, so I caught this before a real church paid for it.

Nothing crashed. No error in the logs. The super-admin screen said "Church provisioned" in a reassuring green. The bug only existed from the point of view of the person on the other end, waiting for an email that was never going to come.

## The setup: provisioning a church

Eglise en Ligne is a multi-tenant Next.js App Router app on Supabase. Each church gets a subdomain on its market's domain: `.egliseenligne.fr` for France, [iglesiaenlinea.es](https://iglesiaenlinea.es) for Spain, `.igrejaemlinha.pt` for Portugal. (I wrote about how that routing once confused Google in [the Soft 404 that hid my multi-tenant SaaS](/blog/soft-404-hid-my-multi-tenant-saas/).)

When I sign up a church from my super-admin panel, a `/api/provision` route does three things:

1. Insert the church row.
2. Create the pastor's auth user with `auth.admin.createUser`.
3. Send the pastor an invitation so they can set a password and reach their admin.

Steps 1 and 2 worked. Step 3 is the story.

## The bug: Supabase generateLink sends no email

Here is the original step 2 and 3, trimmed:

```ts
// 2. Create the admin user
const tempPassword = crypto.randomBytes(16).toString('hex');
await supabase.auth.admin.createUser({
  email: adminEmail,
  email_confirm: true,
  password: tempPassword,
});

// 3. Send invite link
const { error: resetError } = await supabase.auth.admin.generateLink({
  type: 'recovery',
  email: adminEmail,
  options: {
    redirectTo: `http://${subdomain}.${process.env.NEXT_PUBLIC_APP_DOMAIN}/${locale}/admin`,
  },
});

if (resetError) {
  console.error('Failed to generate invite link', resetError);
}
```

Look at what gets destructured: only `error`. The `data` object, which holds the actual link in `data.properties.action_link`, is dropped on the floor. The comment says "Send invite link" and the code does not send it. I think whoever wrote it (me, earlier) assumed `generateLink` behaves like `inviteUserByEmail` or `resetPasswordForEmail`, which do go through Supabase's mailer. It does not. The admin `generateLink` API exists precisely for the case where you want to send the email yourself, with your own provider and your own template.

So the pastor ended up with an account protected by 32 random hex characters that nobody, including me, had ever seen. And even if the link had been sent, there were three more problems hiding behind the first:

- **Wrong domain for two markets out of three.** `NEXT_PUBLIC_APP_DOMAIN` is a single value (`egliseenligne.fr`). A Spanish church lives on `iglesiaenlinea.es`, so its pastor would have been sent to a French hostname that does not know their subdomain.
- **Plain `http`.** Every domain is served over https, and a `redirectTo` also has to match Supabase's redirect allowlist, or Supabase falls back to the project's Site URL. Wildcard subdomains across three ccTLDs is exactly the sort of allowlist I would get wrong.
- **Nowhere to land.** There was no page to set a new password and no "forgot password" link on the login page. Even a pastor who somehow landed in a session had no form to choose a password.

This is the same failure shape as [the funnel events that read zero](/blog/why-every-funnel-event-read-zero/): a system that looks quiet rather than broken. A crash would have been found in a day. Silence can sit there for months.

## The fix: generate the token, own the link, own the email

I kept `generateLink`, because sending the email myself is what I want: I already use Resend for transactional mail, and I need the copy in French, Spanish and Portuguese. What changed is that I now use the result, and I build the link myself from the `hashed_token` instead of relying on Supabase's redirect:

```ts
const { data: linkData, error: linkError } =
  await supabase.auth.admin.generateLink({ type: 'recovery', email: adminEmail });

const tokenHash = linkData?.properties?.hashed_token;
if (linkError || !tokenHash) {
  console.error('Failed to generate invite link', linkError);
} else {
  const churchBaseUrl = `https://${subdomain}.${getDomainForLocale(locale)}`;
  const actionLink =
    `${churchBaseUrl}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}` +
    `&type=recovery&next=${encodeURIComponent(`/${locale}/admin/reset`)}`;

  await sendAdminInvitation({ to: adminEmail, churchName: name, locale, actionLink,
    siteUrl: `${churchBaseUrl}/${locale}` });
}
```

`getDomainForLocale` maps `fr`, `es` and `pt` to the right ccTLD, so the link lands on the church's own domain, over https. Because the link points at my own route and carries the token itself, no Supabase redirect allowlist is involved at all.

That route is small. It verifies the token, which opens a session through the SSR cookie client, then forwards to a relative path:

```ts
// src/app/auth/confirm/route.ts
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const nextParam = searchParams.get('next') || '/fr/admin';
  // Only same-site relative redirects: no open redirect via ?next=
  const next = nextParam.startsWith('/') && !nextParam.startsWith('//')
    ? nextParam : '/fr/admin';

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, request.url), { status: 303 });
  }
  // otherwise: back to the login page with "invalid or expired link"
}
```

The `//` check matters. Without it, `next=//evil.example` would be treated by the browser as a protocol-relative URL, and my login flow would become an open redirect.

Then the pieces that were missing entirely:

- A localized `/[locale]/admin/reset` page that calls `supabase.auth.updateUser({ password })` with the session `/auth/confirm` just opened, then sends the pastor to their dashboard.
- A `/[locale]/admin/forgot` page, a link to it on the login page, and an `/api/auth/forgot` endpoint that reuses the same `generateLink` plus `/auth/confirm` path. It always answers `{ success: true }`, whether or not the email exists, so it cannot be used to find out who has an account.

One last decision: the invitation is wrapped in its own `try/catch`. If Resend has a bad minute, provisioning still succeeds and the error is logged. Rolling back a church because an email failed would be worse, and now the pastor has "forgot password" as a way back in.

This shipped in PR #15 of the eglise-platform repo, merged at the end of September alongside a batch of other funnel fixes.

## The takeaway

Read the return type of every auth helper you call, especially the admin ones. `generateLink` returning a link is the whole point of the function; if your code only looks at `error`, you are using it as a very expensive no-op.

The broader lesson is about which side of the screen you test from. I had tested provisioning as the person clicking "create church." I had never tested it as the person receiving the email. For any flow that ends in someone else's inbox, the test is not "did my API return 200." It is "did a human, on the right domain, end up logged in." Same as with [my Stripe webhooks](/blog/my-stripe-webhooks-were-failing-96-percent/): the success message on my side said nothing about what happened on theirs.
