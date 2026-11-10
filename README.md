# ResolvePay AI

**Evidence-first payment resolution for small online merchants.**
Built solo for the PayPal AI Hackathon 2026.

> AI investigates. Evidence supports the decision. The merchant stays in control. PayPal executes.

Everything runs against the **PayPal Sandbox**. No real money moves, and every payment and refund shown is a real Sandbox API result, never a simulation.

## The problem

Small merchants get complaints like "I was charged twice" or "it arrived damaged". Deciding what to do means checking payment records, customer evidence and refund policy, which are scattered across tools. Acting too fast causes wrong refunds and unhappy customers.

## What it does

1. The merchant creates and captures a payment through PayPal Sandbox (USD).
2. A customer complaint is linked to that transaction (optionally with a photo).
3. The backend re-verifies the capture with PayPal. Only the backend can mark anything "verified".
4. Gemini classifies and summarises the complaint and returns structured JSON, which is validated with Zod. Invalid output falls back to rules only.
5. The **Evidence Readiness Engine** (deterministic rules, no LLM) lists what is verified, customer-provided, merchant-provided or missing, and computes an evidence completeness score.
6. A rule baseline recommendation is computed. The backend always keeps the more cautious of the rule result and the AI suggestion, so the AI can never upgrade to a refund on its own.
7. The merchant approves or rejects. On approval the backend re-validates payment, currency, amount and remaining refundable balance, then calls the PayPal Sandbox refund API.
8. The real PayPal response and every step land in an append-only audit trail.

Two complaint types are supported: **damaged product** (needs photo evidence) and **duplicate charge** (verified against payment records).

## Evidence completeness is not a verdict

The score only measures how much of the required information is present. It is not a probability of winning a dispute and not a judgement of whether the customer is truthful.

## Safety design

- AI never executes refunds and never marks information as verified.
- Refund execution is server-side only, with explicit merchant approval.
- An atomic case lock plus a unique database index allow at most one active refund per case.
- The PayPal idempotency key (PayPal-Request-Id) is the refund row id.
- The refundable balance is re-read from PayPal at execution time.
- The PayPal client refuses to run unless the base URL is a Sandbox URL.
- audit_events rejects updates and deletes at the database level, and an audit write failure stops money movement.
- Secrets are server-side only. Row level security is on with no public policies.

## Stack (all free tier)

Next.js (App Router), TypeScript, Tailwind CSS, Supabase (Postgres and Storage), PayPal Sandbox REST APIs, Google Gemini API (free tier), GitHub, Vercel Hobby.

## AI tools used

- **Gemini API** (Flash model, free tier) for complaint classification, extraction, photo observation and recommendation drafting. Output is schema-validated, and the backend rules override it.
- The project was built with AI-assisted development (Claude).

## Run locally

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in the values.
3. Create a free Supabase project and run `supabase/schema.sql` in the SQL Editor.
4. Create PayPal Sandbox **US** business and personal accounts and a REST app. PayPal does not support INR payments, and Indian sandbox accounts cannot transact in USD with each other.
5. Create a free Gemini API key in Google AI Studio (optional; without it the app uses the rules-only fallback).
6. `npm run dev`, then open `/api/health` to confirm the setup.

## Known limitations

- Single merchant and no authentication (demo scope), so do not expose a deployment with real credentials.
- USD only. One refund per case.
- Sandbox only. No webhooks; state is read from PayPal responses and re-verified on demand.
- Free-tier AI limits may cause the rules-only fallback to be used.