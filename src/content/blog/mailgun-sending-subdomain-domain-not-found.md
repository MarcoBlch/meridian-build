---
title: "My Mailgun Subdomain Didn't Exist for iCloud"
description: "Most of my recent Mailgun failures said 'Sender address rejected: Domain not found'. The sending subdomain had no MX and no A record, and my registrar would not let me add a custom MX. Two A records fixed it."
pubDate: 2026-11-20
tags: [bugs, architecture, indie-hacker]
project: outfitmaker
---

I send a lot of mail for [OutfitMaker](https://outfitmaker.ai) through Mailgun: account emails, reminders, and my own replies to partners, which leave Gmail as hello@outfitmaker.ai through Mailgun's SMTP. Everything goes out on a sending subdomain, `mg.outfitmaker.ai`. SPF and DKIM were green in the Mailgun dashboard. The setup had been "done" for months.

On November 20 I finally opened the list of failed events instead of looking at the delivered count. 221 of the last 300 failures had the same message:

```
Sender address rejected: Domain not found
```

The receiving server was telling me that my sending domain did not exist.

## What the receiving server actually checks

When Mailgun sends a message, the visible From can be anything you verified. The envelope sender, the address bounces go back to, is a Mailgun address on your sending domain. Something like `bounce+...@mg.outfitmaker.ai`.

A lot of mail servers check that envelope sender before they accept anything. Postfix calls it `reject_unknown_sender_domain`. The logic is simple: if a bounce had to come back to this address, could it? To answer, the server looks up the domain. If there is an MX record, fine. If there is no MX but there is an A record, also fine, because the mail RFCs treat the A record as an implicit MX. If there is neither, the domain is "not found" for mail purposes and the message is refused.

So I checked `mg.outfitmaker.ai`. TXT records for SPF and DKIM: present. MX: none. A: none. For a server running that check, my sending domain was a few TXT records floating in space.

## Why nobody noticed

The failures were not spread evenly. They hit mostly `icloud.com` and `privaterelay.appleid.com`, the addresses Apple generates when someone signs up with "Hide My Email". Around 110 a day.

Most of my test mail goes to Gmail, and my own inbox received everything. The dashboard said "delivered" for the bulk of traffic. The Apple users simply never got their emails, and people who never receive an email do not write to you about it.

If your audience signs up with Apple, you are probably sending more mail to Private Relay addresses than you think. It is worth looking at failures grouped by recipient domain at least once.

## The fix I wanted, and the one my registrar allowed

The textbook fix is two MX records on the `mg` host, pointing to Mailgun's inbound servers (`mxa.mailgun.org` and `mxb.mailgun.org`). Mailgun lists them in the domain setup as records for receiving. I never added them, because I did not need to receive mail on `mg`.

The DNS for outfitmaker.ai lives at Namecheap. The root domain uses Namecheap's own email forwarding, which is how hello@ reaches my Gmail. When "Email Forwarding" is selected in Namecheap's mail settings, the panel manages the MX records itself and does not let you add custom ones. Switching to "Custom MX" changes the mode for the whole domain, and the forwarding on the root would stop.

I did not want to touch the inbound path of the main domain to fix an outbound problem on a subdomain. So I used the fallback the receiving servers already accept: A records.

```
mg  A  34.36.182.139
mg  A  34.149.254.5
```

Those were the addresses of `mxa.mailgun.org` and `mxb.mailgun.org` when I looked them up. With an A record, `mg.outfitmaker.ai` resolves, the "domain exists" check passes, and if a server ever tries to deliver a bounce to the implicit MX, it reaches Mailgun. Mail settings on the root stayed exactly as they were.

The records went in on November 20 in the afternoon and were visible on Google's and Cloudflare's resolvers shortly after.

## The catch with pinning IPs

Hardcoding someone else's IP addresses in your DNS is a small debt. While writing this, I resolved the two Mailgun hosts again from a public resolver and both returned `34.36.182.139`. My records still point to addresses Mailgun used, so the existence check keeps passing, which is all I need from them. But if Mailgun moves its inbound servers one day, my A records will quietly point at something else.

For the existence check that does not matter much. For real bounce handling it might. The cleaner long term setup is a real MX on `mg`, which means either moving the root forwarding away from the registrar panel or moving DNS to a provider that lets the two coexist. That is on the list, not done.

## What I check now

I have not yet seen a full day of events since the fix. The plan for tomorrow is boring: filter failed events for "Domain not found" and see the count go to zero, then look at what is left in the failures, because the noise of 221 identical errors was hiding whatever else is in there.

The general lesson, for me: a sending domain is a real domain. "SPF and DKIM verified" in the dashboard says nothing about whether the domain resolves for the server on the other side. Run the same lookups the receiver runs:

```
dig +short MX mg.yourdomain.com
dig +short A mg.yourdomain.com
```

If both come back empty, some of your mail is being refused right now, and probably by the inboxes you test least.

If you run your own mail stack for a small product, I wrote earlier about [blocking disposable email domains at signup](https://meridianbuild.dev/blog/blocking-7500-disposable-email-domains/), which is the other end of the same pipe.
