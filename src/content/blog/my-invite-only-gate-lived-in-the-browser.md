---
title: "My Invite-Only Gate Lived in the Browser"
description: "FastPass was invite-only on paper. In practice the invite check ran in React, Google OAuth skipped it, and the server never asked. How a few accounts walked in, and why the real lock now sits where the money moves."
pubDate: 2026-10-20
tags: [security, architecture, bugs]
project: fastpass
---

[FastPass](https://fastpass.email) is invite-only. That has been true in the database for months: a row in `platform_settings` called `invite_only_mode`, set to `enabled: true`. Sign up without a valid invite code and you get turned away. That was the plan, anyway.

Then I was going through recent signups and found a few accounts with no invite code attached. Nobody had flipped the setting. Nobody had leaked a code. They had simply walked through a door I thought was locked, because the lock was a React component.

This is the story of that door, and of what I changed so that the next one fails closed.

## Why invite-only in the first place

FastPass is a pay-to-reach link. A sender pays to get a message in front of you, the money sits in escrow, and you either reply before your deadline or the sender gets refunded automatically. Stripe Connect handles the payouts.

That last part is why I keep the creator side gated. Every creator who finishes onboarding gets a public payment page and a Stripe Connect account tied to my platform. I want to know who is on the receiving end of that money. I wrote recently about [why the cold start on that side is my real bottleneck](/blog/two-sided-marketplace-cold-start-offer-not-seo/), so I am not gating for scarcity theater. I am gating because a payments platform should know its payees.

## The path in

Here is the route those accounts took. When I traced it, it was almost boring.

1. Someone searches Google and lands on one of my SEO landing pages, `/get-paid-to-answer-messages`.
2. They click "Start earning", which goes to `/auth`.
3. `/auth` opens on the Login tab, not the Sign up tab.
4. They click "Continue with Google".
5. Supabase creates the account.
6. The OAuth callback sends them to the dashboard.

Nothing in that list is an exploit. It is the happy path of a page I built. The problem is step 3 meeting step 4.

## The bug, in four lines

This is the Google button handler from `AuthForm.tsx`, before the fix:

```tsx
const [isLogin, setIsLogin] = useState(!forceSignup);

const handleGoogleSignIn = async () => {
  if (!isLogin && inviteOnlyMode && !inviteCodeValid) {
    toast.error('Please enter a valid invite code above to continue with Google sign-up');
    return;
  }
  // ...
  await supabase.auth.signInWithOAuth({ provider: 'google', /* ... */ });
};
```

The invite check only runs when `!isLogin`. On the Login tab it is skipped, which sounds reasonable until you remember how OAuth works. With email and password, "log in" and "sign up" are different calls. With Google, they are the same call. If the Google account has never been seen before, Supabase creates a user. There is no "log in only" mode for a person who does not exist yet.

So my form had a login tab that could create accounts, and the only invite check lived on the other tab.

It got worse the further I looked:

- `AuthCallback.tsx`, the page Google redirects back to, required nothing. It redeemed an invite code if one happened to be stored, showed a welcome toast, and moved on.
- The check for whether invite-only mode was even on came from an edge function, and the client failed open if that call failed:

```tsx
} catch (error) {
  console.error('Error checking invite mode:', error);
  setInviteOnlyMode(false);
}
```

- And `create-stripe-connect-account`, the function that starts payout onboarding, ran with `verify_jwt = false` and accepted whatever `userId` the request body gave it. It did not check who was calling.

Every layer assumed some other layer had already done the checking. None of them had.

## Why it became urgent

Most of those accounts did nothing. Signed in, looked around, left. One got as far as starting Stripe Connect onboarding.

That was the moment it stopped being a backlog item. An uninvited account with a payout account attached to my platform is a compliance problem, not a UX bug. I suspended that account first, then sat down to fix the actual hole.

## The fix: one gate, on the server

The fix went out as PR #114. Four pieces.

### 1. A shared gate that fails closed

I moved the decision into a shared module for my Supabase edge functions, `_shared/invite-gate.ts`. It is the single source of truth for "is this user allowed in":

```ts
export async function isInviteOnlyMode(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase
    .from('platform_settings')
    .select('setting_value')
    .eq('setting_key', 'invite_only_mode')
    .single()

  if (error || !data) {
    console.error('invite-gate: could not read invite_only_mode, failing closed:', error)
    return true
  }

  return data.setting_value?.enabled !== false
}
```

Compare that with the client version. Same question, opposite default. If the setting cannot be read, the server assumes invite-only is on.

`checkInviteAccess` builds on it. A user is allowed if they are an admin, if their profile has `invited_by_code`, or if the account predates the invite system. Everyone else gets `no_invite_code`. If there is no profile at all, that is a no too.

### 2. A server-side check after OAuth

A new edge function, `enforce-invite-access`, runs with `verify_jwt = true` and resolves the caller from the token, never from the request body. `AuthCallback` now calls it before anything else happens:

```tsx
const { data: access, error: accessError } =
  await supabase.functions.invoke('enforce-invite-access');

if (!accessError && access?.allowed === false) {
  await supabase.auth.signOut();
  toast.error('FastPass is invite-only. Sign up with a valid invite code, or request an invite.');
  navigate('/auth', { replace: true });
  return;
}
```

The welcome toast moved below this check. Small thing, but it used to greet people before deciding whether they were allowed in.

There is one more detail in that function I like. If the rejected account was created in the last 15 minutes, it is almost certainly a Google signup that just happened without a code. The function deletes it, so the person can come back with a code using the same Google account instead of hitting a weird "you already exist but you are not allowed" state.

### 3. The hard lock where the money moves

This is the part that matters most. `create-stripe-connect-account` now checks two things before it talks to Stripe:

```ts
const caller = await getCaller(supabase, req)
if (caller?.id !== userId) {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, /* ... */ })
}

const access = await checkInviteAccess(supabase, userId)
if (!access.allowed) {
  return new Response(
    JSON.stringify({ error: 'FastPass is invite-only. Please redeem an invite code before setting up payouts.' }),
    { status: 403, /* ... */ }
  )
}
```

The caller's JWT must match the `userId` in the body, otherwise 401. The caller must pass the invite gate, otherwise 403. No Stripe account means no public payment page, so this one check protects the thing I actually care about.

### 4. A deliberate fail-open, one layer up

You might notice that `AuthCallback` lets the user through if `enforce-invite-access` errors out. That is on purpose, and the comment in the function says so:

```ts
// No verdict on errors: the hard gate is create-stripe-connect-account,
// so an outage here must not lock legitimate users out of their dashboard.
```

The difference from before is that this fail-open is a choice with a backstop. If the soft check breaks, an uninvited person might see an empty dashboard. They still cannot start payouts, because the Stripe function fails closed on its own. Before the fix, every layer failed open and none of them was the backstop.

## Deploy order matters

The frontend ships through Vercel when I merge. The edge functions ship separately, with `supabase functions deploy`. Merge first and the new `AuthCallback` calls an `enforce-invite-access` function that does not exist yet. That call errors, the callback lets the user through, and I have gained nothing.

So the order written in the PR was:

1. `npx supabase functions deploy enforce-invite-access create-stripe-connect-account`
2. Merge the PR.

Functions first, then the client that depends on them. Obvious when written down, easy to get backwards when you are in a hurry to close a hole.

## What I have verified, and what I have not

After deploying, I called both functions without authorization. Both returned 401. The build passed, and the touched files did not add new type or lint errors.

What I have not done yet is the real end-to-end test: a fresh Google account, no invite code, through the landing page, the Login tab and the Google button, to confirm it gets signed out and deleted. That is on my to-do list, and until I have run it I will not call this fully verified. The Stripe-side lock does not depend on that flow working, which is exactly why I put it there.

## The lesson

A client-side gate is a UX hint. It tells honest users what to expect. It is not a lock, because the browser is not yours, and because the flows you build (OAuth, deep links, a landing page CTA pointing at the wrong tab) will find paths around it that nobody attacked on purpose.

Put the lock on the server, at the point where something irreversible happens. For FastPass that is the creation of a Stripe Connect account, not the signup form. Make it check identity from the token, not the request body. And make it fail closed, so that when something upstream breaks, the default answer is no.

The same mindset got me out of [my Stripe webhook mess](/blog/my-stripe-webhooks-were-failing-96-percent/): the money path deserves its own checks, independent of everything in front of it. I just had to learn it twice.
