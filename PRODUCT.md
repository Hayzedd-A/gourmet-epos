# Product

## Register

product

## Platform

web

## Users

Two distinct users on the same app, usually on the same terminal:

- **Counter staff** at a Gourmet Twist branch, ringing up banana-bread sales during a rush. Often standing, moving fast, sometimes on a touchscreen. The job: get from "customer wants two loaves" to a completed, paid sale in as few actions as possible, with zero tolerance for the app blocking them because the internet is down.
- **Store admins**, using the same terminal (or a back-office one) at a calmer moment: managing the product catalog, reviewing sales history, voiding a mistaken sale. Mouse-and-keyboard pace, more information density is fine here.

## Product Purpose

An offline-first point-of-sale app for Gourmet Twist (a Lagos banana bread bakery), built to scale from one branch to a multi-branch chain. Staff record sales entirely offline; an outbox syncs them to the Zupa API whenever connectivity is available. Admins manage the product catalog (full CRUD, written through to Zupa) and review/void sales. Success looks like: a sale can always be rung up regardless of network state, and nothing about the UI makes staff second-guess whether it "worked."

## Brand Personality

Clean, minimal, professional. This is retail infrastructure first, bakery brand second — the bakery's warmth lives in the product staff are selling, not in decorating the till. Confidence and speed over cuteness; a neutral, professional palette with the product doing the talking rather than heavy branding.

## Anti-references

The generic AI/SaaS-dashboard look: cream/beige backgrounds, purple gradient accents, identical icon-card grids, tiny uppercase tracked eyebrows above every section. This should read as considered retail software, not a template dashboard.

## Design Principles

- **Touch-first speed.** Every checkout action reachable in the fewest taps/clicks; hit targets sized for a fast-moving counter, not a mouse-precise desktop app.
- **Status is ambient, never alarming.** Offline/sync state is quiet, always-visible information, not a blocking banner — being offline is the expected steady state, not an error.
- **Numbers are the hierarchy.** Prices, totals, and change are the most-looked-at data on screen; they get the clearest visual weight, always.
- **Admin is a quieter mode, not a different app.** Same visual language as the till, denser and calmer, built for someone seated with a mouse rather than tapping fast.
- **Errors are recoverable, not scary.** A wrong PIN, a void, a sync hiccup reads as "try again," never as a system fault.

## Accessibility & Inclusion

WCAG AA contrast minimum throughout. Touch targets ≥44px on all POS/checkout controls. Admin section must be fully keyboard-operable. Status (sync state, product availability, sale outcome) is never conveyed by color alone — always paired with icon or text.
