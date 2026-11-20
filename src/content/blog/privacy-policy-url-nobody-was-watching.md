---
title: "The Privacy Policy URL Nobody Was Watching"
description: "KidCapital's privacy policy link on Google Play returned a 404, and the App Store pointed to an old gist that no longer described the app. Store consoles accept a URL once and never check it again. Neither did I."
pubDate: 2026-11-20
tags: [indie-hacker, security, architecture]
project: kidcapital
---

[KidCapital](https://meridianbuild.dev/projects/kidcapital/) is a small money game for kids, on iOS and Android. Like every app on both stores, it has a privacy policy URL typed into two consoles: Google Play Console and App Store Connect. I filled those fields once, early, and moved on to the parts of the app people actually see.

On November 20 I was cleaning up a list of warnings in Play Console before sending a release for review. The privacy policy URL was one of the blockers. I clicked it. 404.

## How the link died

The URL pointed to a GitHub Pages site for the app's repository. A few weeks earlier I had restricted what that Pages site served, for good reasons, and later it stopped serving the policy at all. Nothing in my setup knew that a store console depended on that one path. The site changed, the link broke, and the only system that noticed was Google's review pipeline, weeks later.

For a kids' app that is not a cosmetic problem. The privacy policy is the document a parent, or a store reviewer, reads to decide whether the app is safe. Mine was a dead page.

## My first fix was wrong too

The App Store listing had a different URL: a GitHub gist. It worked, it loaded, Apple had accepted it. The quick fix was obvious: paste the same gist URL into Play Console, both stores aligned, done. I did that.

Then I read the gist.

It dated from March, from an earlier version of the app. It mentioned collecting an email address and using PostHog for analytics. The current app does neither. It uses anonymous accounts with an animal pseudonym, and RevenueCat for the one in-app purchase. The real, current policy existed. It was in the repository as an HTML page, written in French and English in October, covering both Apple and Google. It just was not at any URL either store knew about.

So for months the App Store had pointed parents at a policy describing data collection the app no longer did, and for some time Google Play had pointed them at nothing. And for a few hours on November 20, after my "fix", both stores pointed at the outdated one.

## Where the policy lives now

I wanted a URL I control, on a domain that is not tied to how one repository happens to be published. This blog already runs as a static site with automatic deploys, so the policy now lives here:

[https://meridianbuild.dev/kidcapital/privacy/](https://meridianbuild.dev/kidcapital/privacy/)

It is a plain copy of the HTML page from the app repository, dropped into the blog's `public/kidcapital/privacy/` folder, so the static build serves it as is. No framework, no layout, nothing that a future blog redesign can break by accident.

Then the consoles:

- **Google Play**: URL replaced, the change sits with other pending changes until it is sent for review and published.
- **App Store Connect**: URL replaced, it goes live with the next app version, which is already in the queue.

The cost of this setup is that the policy now exists in two places, the app repository and the blog. Any future change has to be made in both. I wrote that down where I will see it, because "two copies" is exactly how the gist went stale.

## What is still not aligned

Fixing the URL surfaced the next layer. Apple's privacy label for the app, the "Data collected" section on the App Store page, still declares the categories from March: contact info, diagnostics, usage data. Those match the old gist, not the app. Play's Data safety form and the current policy say something different. That is the next thing to realign, and it matters more than the URL, because the label is what most parents actually look at.

I am mentioning it because it is the honest state of things. Fixing one field in a store console tends to reveal the three next to it that were filled in the same week, by the same tired person, for a version of the app that no longer exists.

## The lesson

Every store console has a handful of URLs you type once: privacy policy, terms, support, marketing site. They are legal and trust documents, they are linked from your public listing, and nothing watches them. The console checks the URL when you save it. After that, nobody does. Your uptime monitor watches your homepage and your API. Your CI checks your code. The page that a regulator, a reviewer or a worried parent will open is checked by no one until something rejects your release.

What I changed in how I work:

1. **Legal pages live on a domain I control**, served as static files, not on whatever hosting a repository happens to have this month.
2. **One source, one URL per document**, and the same URL in every console. If the stores disagree, one of them is wrong.
3. **Read the page, not the status code.** The gist returned 200 the whole time. A working link to the wrong document is worse than a dead one, because nothing ever flags it.

If you ship an app, open your store consoles today, click every URL you declared, and read what is on the other end. It does not take long. I had not done it since the day I filled those fields.

If you are setting up release automation for a small app, I wrote about [using one version number for iOS and Android in CI](https://meridianbuild.dev/blog/one-version-number-ci-play-drafts/), which is where this list of console chores started.
