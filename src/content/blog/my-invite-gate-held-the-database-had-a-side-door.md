---
title: "My Invite Gate Held. The Database Had a Side Door."
description: "After fixing FastPass's invite-only gate, readers asked the right question: what about the database? I rebuilt the production Supabase schema in a throwaway Postgres without a password or a dump, proved the copy was faithful, attacked it with 70 probes, and fixed what they found the same day. The method, and the traps on the way."
pubDate: 2026-11-01
tags: [supabase, postgres, security, indie-hacker]
project: fastpass
---

A few weeks ago I wrote about how [my invite-only gate lived in the browser](/blog/my-invite-only-gate-lived-in-the-browser/) on [FastPass](https://fastpass.email), and how I moved it to the server. The comments were kind and sharp. One of them basically asked: you locked the front door, but did you check the back door?

I hadn't, not properly. The gate lived in Edge Functions, and it was tested there. But Supabase also exposes the database itself to the browser through PostgREST, and what the browser can do there is decided by Row Level Security (RLS). If RLS let a client write a value that the gate trusts, the gate is decoration.

On October 27 I checked. It did. This post is about how I found out without touching production data, and what I'd do the same way on any Supabase project.

I'll describe the problems at the level of their class. They're fixed, but there's no reason to publish a recipe.

## The trap: RLS is about rows, not columns

This is the part I wish someone had told me on day one.

An RLS policy like "a user can update their own profile" answers one question: which rows? It says nothing about which columns. Once a user is allowed to update their row, they can update every column in it, from the browser, with the public anon key and their own session.

And Supabase's default privileges grant `anon` and `authenticated` broad rights on tables in `public`. So unless you restrict it, "update your own row" means "update anything in your own row", including the fields your server logic trusts: a status, a flag, a role, a counter.

That was my side door. The invite gate checked something that the database let the user change.

## Step 1: a copy of production, without production

I wanted to attack the real schema, not the one in my migrations folder, because those two drift. But I didn't want to point probes at production, and I didn't have (or want) the database password on the VPS.

So I rebuilt the schema from read-only catalog queries through the Supabase Management API: tables, columns, functions, triggers, every policy and every grant. No rows, no user data. Then I loaded it into a throwaway Postgres in Docker, on a tmpfs, with small stubs for `auth.uid()` and `auth.jwt()`.

How do you know the copy is faithful? I took an md5 fingerprint of the policies (a hash over `pg_policies`, ordered) on both sides. Same hash, same rules. That one number is what made me trust everything that came after.

## Step 2: probes that impersonate a client

Each probe pretends to be one kind of caller and tries one thing:

```sql
begin;
savepoint probe;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"<user-a-uuid>","role":"authenticated"}', true);

update public.some_table set some_column = 'x' where id = '<row-of-user-b>';

rollback to savepoint probe;
```

`set local role` plus fake JWT claims is exactly what PostgREST does for a real request, so the policies see the same thing they'd see in production. Each probe runs inside a savepoint that is always rolled back, so probes can't affect each other.

I wrote 70 of them, for three callers: anonymous, a logged-in user, and `service_role`. They covered both directions:

- **Must fail**: reading someone else's data, writing a protected column, calling a function you shouldn't.
- **Must work**: everything the real app does. A security fix that breaks signup is not a fix.

The first run listed problems in four classes:

1. Users could change sensitive columns on their own profile, because nothing restricted columns.
2. Some policies meant for the server only were also open to client roles.
3. Referral codes could be issued to accounts that shouldn't get them.
4. Statistics views ran with their owner's rights instead of the caller's, because they were created without `security_invoker`.

## Step 3: the fix, with a proven way back

The migration does what you'd expect: column-level `GRANT UPDATE (col1, col2)` instead of table-wide rights, server-only policies restricted to `service_role`, views switched to `security_invoker = true`, and functions that look up trusted state in the database instead of in what the client sends.

Before pushing it, I wrote the rollback and tested it on the bench: apply up, apply down, and check that the policy fingerprint is back to the production one. Only then did it go to production, the same day. After the migration, all 70 probes passed, and production REST traffic showed zero 401 or 403 responses, so the real app wasn't tripping over the new rules.

## The fix that would have broken every email signup

One fix deserves its own paragraph, because the obvious version was wrong.

The function that redeems an invite code should only redeem it for your own account. The obvious rule is "the user in the JWT must be the account being redeemed for". But with email signups, the redeem runs right after the account is created, before the email is confirmed, so there's no session yet. The obvious rule would have rejected every email signup.

The real rule has two branches. With a session, the JWT user must match. Without one, the account must have been created minutes ago and not be confirmed yet. Writing the "must work" probes first is what showed me that.

I also added 27 regression tests for the gate in CI (Deno), including a replay of the OAuth bypass I fixed earlier, run against an in-memory fake of Supabase so no real Google account is needed. To check that the tests test something, I removed the ownership check from the code and watched them fail.

## Traps on the way

- **`safeupdate` can make a probe fail for the wrong reason.** Supabase uses `pg-safeupdate`, which rejects an `UPDATE` without a `WHERE`. A "must fail" probe that fails because of it proves nothing about RLS. Always give probes a real filter.
- **My bench ignored column grants at first** and reported false failures. If you rebuild a schema, rebuild the privileges too, not just the policies.
- **`EXPLAIN` checks privileges without running the query.** That's a safe way to confirm in production that a role can't touch a column: you get "permission denied" or a plan, and nothing is executed.
- **`supabase db push` wants the database password.** I applied the migration through the Management API instead.
- **The old logs endpoint I'd planned to use returned 410 Gone.** I verified with gateway logs instead.

## Same bench, another project: the NULL in the lobby

I ran the same method the same day on [KidCapital](https://marcoblch.github.io/Kidcapital), my money game for kids: around 45 probes, three callers (anonymous, a player targeting another player, a member of a game). The findings went from 18 to 5, and I accepted the 5 that remain. The normal journey (solo game, leaderboard, multiplayer create, join, play, finish, data deletion) passed 18 out of 18 before and after.

Two bugs from that project are worth stealing.

**A privacy fix that broke game creation.** A few days earlier, I'd made multiplayer games visible only to their players, through a membership function. Right after, nobody could create a game. The client inserts a game and asks for the row back (`INSERT ... RETURNING`), and the `RETURNING` part is checked against the select policy. But the membership function can't see the row that's still being inserted, so the check fails and the whole insert is refused. The fix: let the creator see their own game directly, without the function. Fixed the same day, with an end-to-end test in production passing 8 out of 8.

**A guard that said nothing.** A trigger compared the current user with the player whose turn it is. In the lobby, before the game starts, that player is `NULL`. In SQL, `x <> NULL` is not true or false. It's `NULL`, and an `IF` treats it as "don't fire". So the guard was silent exactly when nobody was playing yet. The fix is `IS DISTINCT FROM`, which treats `NULL` as a value. The bench caught it because it tests the rejection cases, not only the happy path.

## What I'd tell any Supabase builder

- RLS picks rows. Use column-level grants for the columns your server trusts.
- Never trust `user_metadata` for roles or permissions. The user can edit it. Use `app_metadata` (set with `service_role`) or your own table.
- Audit a copy, not production, and prove the copy is faithful with a fingerprint of `pg_policies`.
- Write "must work" probes next to "must fail" ones. They're what stop a security fix from breaking signup.
- Test your rollback before you need it.

The person who asked about the back door was right. The best thing about building in public is that people ask the question you were avoiding.
