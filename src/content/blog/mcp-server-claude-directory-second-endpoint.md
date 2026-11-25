---
title: "My MCP Server Broke the Claude Directory Rules, So I Built a Second Endpoint"
description: "OutfitMaker's MCP server renders outfits on an AI-generated model, and the Claude connector directory excludes people-generation. Instead of hiding the tool, I shipped /mcp/closet: five tools, one read scope, descriptions with nothing addressed to the model. Submitted November 20, approved as a community connector November 25."
pubDate: 2026-11-25
tags: [rails, ai, architecture, indie-hacker]
project: outfitmaker
---

On November 25, [OutfitMaker](https://outfitmaker.ai) was approved as a community connector in Claude's official connector directory. That sentence took about seven weeks, and most of them were spent on one tool that could not be in the listing.

This is the story of that tool, the second endpoint I built around it, and the checklist I would run before submitting any MCP server to a directory.

## What I was trying to submit

OutfitMaker is a wardrobe app. People photograph their clothes once, and it suggests outfits from the pieces they own, matched to the weather and the occasion. Its MCP server lets an assistant do the same from a chat, with OAuth (dynamic client registration and PKCE) so the assistant only ever reads the connected account's own wardrobe.

The authenticated endpoint, `/mcp/wardrobe`, has six tools. Five of them read things: today's outfit, a suggestion for an occasion, a summary of the wardrobe, a short help text. The sixth is `show_me_the_look`. It takes one of the suggested outfits and renders it on a model, as an image. It is the most visual thing the product does, and in a chat it is the moment people actually react to.

In early October I had the submission ready: icon, screenshots, privacy policy section for AI assistants, a demo account for reviewers, tool titles. The URL in the form was `/mcp/wardrobe`.

## The rule I had not read

The form links to the [Anthropic Software Directory Policy](https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy). When I got to that step on November 18, I read it properly for the first time.

Section 4.B lists AI-generated media that the directory does not accept. Image generation models that are not purely design focused are on it, and "people-generation capabilities" is named in the same line. Slides, diagrams, charts, UI mockups and logos are allowed. A tool that draws a person wearing your clothes is not a diagram.

The form also asks you to confirm that your tool descriptions contain no instructions to the model.

So I had two problems. One tool generated people. And when I reread my descriptions, several sentences were not describing the tool at all. They were telling the model what to do.

## The options I had

There were three ways out:

1. Tick the boxes and hope the review does not look closely.
2. Remove `show_me_the_look` from the server for everyone.
3. Serve a version of the server that matches the policy, and keep the full one where it is allowed.

The first was never on the table. A listing that depends on a reviewer not noticing is a listing you can lose any day, and I did not want my name on a form that said something false.

The second would have broken the people already connected through `/mcp/wardrobe`, and the version prepared for ChatGPT. When I checked OpenAI's app rules the same day, they did not exclude this kind of image generation.

So I went with the third.

## /mcp/closet

`POST /mcp/closet` is the same server with a different set of tools. It went out in PR #287.

```ruby
WARDROBE_PATH = "/mcp/wardrobe"
CLOSET_PATH = "/mcp/closet"
MCP_PATHS = ["/mcp", WARDROBE_PATH, CLOSET_PATH].freeze
TOKEN_REQUIRED_PATHS = [WARDROBE_PATH, CLOSET_PATH].freeze

def scopes_for(path)
  path == CLOSET_PATH ? [SCOPE_WARDROBE_READ] : SCOPES
end
```

The controller picks the variant from the request path and passes it down in the server context. The account tools come from one switch:

```ruby
# /mcp/closet: nothing that generates an image.
CLOSET = [ClosetOutfitToday, MyWardrobeSummary].freeze

def for(closet: false)
  closet ? CLOSET : ALL
end
```

What changes on the closet endpoint:

- **Five tools.** Three public ones (what to wear today, suggest an outfit, about) and two that read the account (today's outfit from your own wardrobe, wardrobe summary). No `show_me_the_look`, and no widget that renders a look.
- **One scope.** The OAuth metadata and the 401 challenge only ask for `wardrobe:read`. The render tool needed a write scope, and a connector that cannot render has no reason to ask for it.
- **No back door.** A call to `show_me_the_look` on `/mcp/closet` is not treated as an account tool. It goes on to the server, which answers "Tool not found" like it would for any other unknown name. I did not want a hidden tool that still worked if a client guessed its name.
- **A link instead of a render.** `my_outfit_today` on this endpoint ends with a link to the suggestion's page in the app. If you want to see the look on a model, you open OutfitMaker. The connector itself never generates an image.
- **A neutral help text.** `about_outfitmaker` on this endpoint does not mention renders or plans.

`/mcp/wardrobe` kept its six tools and its behaviour. The MCP tests passed (171 runs, 0 failures), including a new integration test file just for the closet variant.

## Descriptions that describe

This part applied to every endpoint, not just the new one.

The weather tool's description ended with a hint I had added earlier: "Asked in the evening? Use day=tomorrow". Useful, maybe. It was also an instruction to the model sitting inside a tool description, which is exactly what the form asks you to rule out. It went.

`my_outfit_today` had a sentence telling the model never to present a borrowed basic (say, a pair of dark jeans when the closet has no bottoms) as the user's own piece. That rule matters, so I did not drop it. I moved it into the tool result, where it is a fact about that specific answer instead of an order in the description.

The wardrobe summary said it was "useful context before suggesting or discussing outfits". That is advice to the model about when to call it. Now it says what it returns, that it is read-only, and that it is free.

The rule I ended up with: a description says what the tool does, what it needs, and what it returns. Anything about how the assistant should behave either belongs in the result or does not belong anywhere.

## The annotation I thought I had

The submission portal scans your server, and it flagged every tool with "Missing title annotation". My tools already had a `title`. In MCP that is a top-level field on the tool, and `annotations.title` is a separate one. The portal wanted the second.

PR #288 added it to the nine tool definitions across both endpoints, same text as the existing title:

```ruby
annotations(title: "My wardrobe summary", read_only_hint: true,
            destructive_hint: false, open_world_hint: false)
```

When the form was submitted on November 20 the warning was still showing, even though `tools/list` returned both titles on all five tools. It did not block the submission, so my guess is a cached scan on the portal side.

## Timeline

- Early October: submission package ready, pointing at `/mcp/wardrobe`.
- November 18: policy read, endpoint built, descriptions cleaned, annotations added.
- November 20: submitted with `/mcp/closet`, five tools.
- November 25: approved as a community connector, then published from the directory admin page.

The review took five days. The part that took weeks was me not reading the policy before building the package.

## The checklist I would use next time

If you are about to submit an MCP server to a directory, this is what I would check first:

1. **Read the policy before the form.** Go through the excluded use cases line by line against each tool, not against the product as a whole. My product was fine. One tool was not.
2. **Split by endpoint, not by flag.** A separate path with its own tool list, its own scopes and its own metadata is easy to reason about and easy to test. A tool that is hidden but still callable is not compliant, it is just quiet.
3. **Ask for the smallest scope the endpoint can use.** If a tool is gone, the scope it needed should be gone from the challenge too.
4. **Strip descriptions down to what, needs and returns.** Search them for "use", "always", "never", "before", "call". Each hit is probably talking to the model.
5. **Move behavioural rules into results.** If something must be true about an answer, say it in the answer.
6. **Set `annotations.title` and the read-only or destructive hints on every tool**, even if you already have a top-level title.
7. **Have the privacy policy URL ready and actually check it.** I learned that one the hard way on [a different project](/blog/privacy-policy-url-nobody-was-watching/).
8. **Never tick a box that is not true yet.** Fix the product, then tick it.

The full version of the server, render included, still runs at `/mcp/wardrobe`. The version in the Claude directory reads your wardrobe and sends you to the app for the picture. That turned out to be a reasonable split, and if you are curious how the suggestions themselves are built, I wrote about [the multimodal side](/blog/multimodal-ai-for-outfit-suggestions/) a while ago.
