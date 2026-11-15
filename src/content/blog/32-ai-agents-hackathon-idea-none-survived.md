---
title: "I Sent 32 AI Agents to Find a Hackathon Idea. None Survived."
description: "Marc Lou's $100K hackathon ranks products by profit in 30 days. I gave a swarm of AI agents a strict spec to find the idea. Ten ideas went in, one barely came out, and the follow-up search taught me more about my filter than about the market."
pubDate: 2026-11-15
tags: [ai, indie-hacker, growth]
---

Marc Lou is running a $100K hackathon. It starts on November 16 and lasts 30 days. The ranking is not about votes or demos: it is about profit, verified from the payment provider. Nothing can be created before day one, not even a domain.

That rule changes everything. You cannot lean on an existing audience for a product, an SEO head start or a waitlist. You need an idea that makes money from strangers, fast.

So I did what a lot of builders are doing right now. I asked AI to find it for me.

## The setup

I run several Claude Code sessions on a small server, one per project, plus one that coordinates the others. For this I wrote a spec first, then let the coordinator launch a workflow:

1. **Hunt.** Ten scout agents, each with a different angle: marketplaces, seasonal demand, end of year B2B, tools for builders, local shops, creators and resellers, 2027 deadlines, explicit "I would pay for" requests, spreadsheets and templates, and one wildcard. Each scout could spawn its own sub-agents.
2. **Merge.** Deduplicate and keep the ten strongest ideas.
3. **Contradict.** Two independent critics per idea, each told to attack it from a different lens. When in doubt, refute.
4. **Verdict.** Score what is left against the spec.

The spec had ten criteria. The ones that mattered most in the end:

- proof that people already pay for this (prices, reviews, real listings);
- a channel that reaches buyers within 48 hours;
- no free tool that already does the job well enough;
- a credible path to $5,000 of profit in 30 days without an audience.

Around 32 agents in total. A few hours later, I had a verdict.

## What came back

One idea survived, barely: a plug and play Advent calendar for Wix, Webflow, Framer and Squarespace sites. It scored 13 out of 20 after the critics were done with it.

The critics were good. They found that WordPress already has a free plugin for this, so the target had to move to the other site builders. They pointed out that most brands plan their December campaigns in October. And on the $5,000 criterion, almost every critic gave almost every idea a zero, including the survivor.

Nine ideas died for the same three reasons: a free tool already covers it, there is no way to reach buyers in two days, and the math to $5,000 does not work from a cold start.

One of the dead ideas was my favorite: a kit to run several Claude sessions from your phone, like I do. A scout found that Claude Code now ships official remote and messaging features, and open source projects already cover the rest. Dead in one paragraph.

## Round two, and the mistake

I did not like the survivor. Neither did the person I build with. So we changed the target: French freelancers, a market I can actually talk to.

One research agent came back with a plan: a tool that sends quotes as web pages, collects the deposit at signature and chases late payments. Its report said no French tool covered the whole flow.

I turned that into a detailed plan, with pricing, a 30 day calendar and profit scenarios. Then came a simple question: "Are you sure there is no French competitor? What is the moat?"

Three searches. Abby, a popular French invoicing tool, already offers signed online quotes, an automatic deposit invoice at signature and card payments. Freebe and others cover the rest. On freelance marketplaces, people sell "I will automate your quote follow ups" as a service.

The agent was wrong, and I had not checked. That one is on me, not on the agent.

## What I actually learned

**The filter decides the outcome.** I told the critics to refute when in doubt. I asked for proof of demand, no free competitor and $5,000 without an audience. Almost nothing passes that, for anyone. Ten dead ideas out of ten is not a finding about the market. It is a finding about my spec.

**"No competitor" is the cheapest claim to verify, and the most expensive to get wrong.** Any time an agent says a market is empty, it costs five minutes to search for it yourself. I now treat that sentence as a red flag, not a green light.

**At launch, nobody has a moat.** Look at the products that win this kind of contest. They are rarely technically unique. Marc Lou's own ShipFast is a boilerplate in a category full of them. The moat comes later: an audience, a brand, customers who stay, data.

**Competition is not bad news.** Every competitor I found is proof that people pay for the problem. The useful question is not "is anyone doing this?" but "can I reach these buyers better than they can?"

## So what now

The hackathon starts tomorrow. Thirty two agents gave me a lot of research and one clear lesson: the hard part was never the idea. It is distribution, and no agent can find that for you. You build it, one conversation at a time.

I am still using AI for research. I just stopped asking it to find a moat that does not exist on day one.
