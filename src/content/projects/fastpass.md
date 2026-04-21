---
name: "FastPass.email"
tagline: "Pay-to-reach escrow messaging"
description: "An escrow-based messaging platform where senders pay a small fee to reach busy professionals. Anti-spam through economics, not filters."
url: "https://fastpass.email"
status: "building"
stack: ["Supabase", "React", "TypeScript", "Stripe Connect", "Postmark"]
featured: true
order: 2
---

An escrow-based messaging platform where senders pay a small fee to reach busy professionals. If the recipient responds, they keep the fee. If they don't, the sender gets refunded. Anti-spam through economics, not filters.

The premise is simple: if your time is valuable, your inbox should reflect that. FastPass.email lets professionals set a price for unsolicited messages. A recruiter who really wants to reach you pays $5. A cold-emailer who's blasting 10,000 people won't. The economics filter out noise better than any spam algorithm.

Built on Supabase for auth and real-time features, React with TypeScript for the frontend, Stripe Connect for escrow handling, and Postmark for transactional email delivery. The escrow logic ensures fairness: funds are held until the recipient either responds (earns the fee) or the window expires (sender gets refunded).
