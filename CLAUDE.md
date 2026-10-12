# Smart Cashier — notes for Claude Code

This app runs on **Homeroom**. If you're Claude Code
editing this repo, read the platform conventions before making
changes:

**Platform conventions (authoritative, always current):**
https://app.onhomeroom.com/claude.md

Fetch that URL at the start of each session — it's the single source
of truth for platform-wide behavior (auth model, `USERNODE_ENV`,
public/private tables, "don't `git push`", etc.). The hosted copy is
updated in place when platform rules change, so fetching it gives you
today's rules, not a stale snapshot.

When running inside Homeroom's dev-chat, those same conventions are
already injected into your system prompt, so the fetch is a no-op in
that path — but it's the right reflex when someone runs Claude Code
against this repo locally or from another harness.

## Connector permission prompts

This repo ships `.claude/settings.json`, which allows the **read-only**
Homeroom connector calls (`mcp__homeroom__get_*`,
`…__list_*`, `…__whoami`) so they stop prompting one at a time. Everything
that acts — filing a request, opening or advancing a proposal — still asks.
Claude Code applies those rules only after you accept the
workspace trust dialog, which lists them for review. See `.claude/README.md`
for the whole story, including what to do if you are still being prompted
(usually: your connector is registered under a different name than the rules
assume).

## Check that this checkout is current

You may be working in a fork of this app whose `main` is behind the app's
canonical repository, and nothing in the checkout says so: `git fetch origin`
compares the fork with itself. This matters before you **read** code to answer
a question about how the app behaves now, not only before you edit it.

The canonical repository is named in `.claude/homeroom-canonical-repo`. Check against
it, not against `origin`:

```sh
git fetch "$(cat .claude/homeroom-canonical-repo)" main
git merge-base --is-ancestor FETCH_HEAD HEAD && echo current || echo behind
```

`behind` means this checkout does not contain the canonical `main`. To answer
a question, read the canonical code instead (`git show FETCH_HEAD:<path>`,
`git grep <pattern> FETCH_HEAD`). To change code, start from the exact base
commit your Homeroom work order gives, and never merge or rebase onto the
canonical `main` yourself: which commit a change is diffed against decides
what the group votes on. With the Homeroom connector, `get_checkout_status`
answers the same question.

A session-start hook (`.claude/hooks/homeroom-freshness.sh`, see `.claude/README.md`) runs
this check for you and tells you when you are behind. It is silent offline, so
its silence is not proof the checkout is current. Inside Homeroom's dev-chat
the platform fixes the base commit, and none of this applies.

## Starter template

The screen this app currently ships — the "Starter template" hero with
the app's thumbnail tile and the plain-English note on how the app gets
built (by asking Homeroom bot) — is placeholder content from the
Homeroom starter template, not product intent.

When the user asks for their first real feature, REPLACE the template
screen rather than building alongside it:

- remove the `usernode-starter-notice@1` block in `public/index.html`
  (both sentinel comments and everything between them),
- rewrite `README.md` to describe the actual app.

Keep the `usernode-dev-console@1` forwarder `<script>` when rewriting the
HTML — that block is platform infrastructure, not template content. So is
the bridge `<script>`. The design kit is not placeholder either: build the
real app with it, and fill in "## Design" below.

The screen has a light and a dark look and follows the viewer's Homeroom
theme, switching live when they change it: the theme `<script>` right after
the bridge tag sets a `dark` class on `<html>`. Keep that script, and give
everything you build both looks (the design kit's colour tokens carry both), unless one
fixed look is the point of this app, like a game's own scene; then say so
under "## Design" below. Unless a request asks for one, add
no theme picker: the viewer's Homeroom setting is the control. "The
platform's light/dark theme inside the app frame" in the platform
conventions has the details.

If a rule below this line conflicts with the hosted conventions, the
hosted conventions win. This file is **app-specific** — write down
things about *this* app that belong in the repo: product intent,
data-model quirks, style preferences, opt-in policies (e.g. which
tables you've marked private), etc.

---

## About Smart Cashier

Point of sale for small merchants, with staff roles. The daily job is the
register screen: tap products onto a paper receipt, tap Charge, record how
the customer paid (cash with change given, card, or QR). Finance keeps the
summary, every transaction and cash payouts; Insights shows sales per day,
best sellers and busiest hours. Every person in the shop has a role the
owner defines with any mix of five permissions (register, products,
finance, insights, staff); Owner always has everything and cannot be
removed or edited. The currency is chosen at shop setup (30 codes, each
with its own digits and symbol), so the app is usable worldwide, not one
country only.

## Design

This app's look. The first real version fills in the blanks; every later
change follows it, and updates it when a request changes the look on purpose.

- **Palette:** accent is "paid" green (a deep market green in light, a
  brighter signal green in dark); neutrals are cool counter-top greys;
  the receipt uses a warm paper token in both looks. Danger red is the
  only other colour.
- **Signature element:** the printed receipt. It is the paper ticket the
  shop hands over: scalloped top edge, receipt (mono) type, dotted leaders
  between item and price, dashed rule above the total. It appears docked
  on the register, in the charge sheet and as the sale detail in Finance.
- **Type scale:** `text-title`, `text-heading`, `text-body`, `text-small`
  _(change their sizes in `tailwind.config.js` if you must, not their number)_

Category chips and product tiles draw their category colours from six
tokens (`cat-red`, `cat-amber`, `cat-teal`, `cat-blue`, `cat-plum`,
`cat-slate`), used only as tint and dot colour, never for text.

The kit is in `styles/tailwind-input.css`: colour tokens with a light and
a dark value (named in `tailwind.config.js`), and a few components
(`btn-primary`, `btn-secondary`, `field`, `list` and `list-row`,
`card`, `section-label`, `skeleton`, `state-empty`, `state-error`).
Re-theme by changing the token values there, keeping every text pair at
4.5:1 or more in both looks.

- Colour comes only from the tokens (`bg-ground`, `bg-surface`,
  `text-fg`, `text-muted`, `border-line`, `bg-accent` with
  `text-on-accent`, ...): never a raw hex value or a stock palette class.
- Tap targets are at least 44 px; the buttons and fields already are.
- A field's label says what it is; its placeholder, if any, is an example
  that says so ("e.g. 5.0"), never a bare value that could pass for one
  already entered.
- Every screen that loads data has honest loading, empty and error states.
  Never show the empty state while loading or after a failure; an error says
  what failed, what still works, and offers Retry.
- Seed obviously fake staging demo data so the populated screen can be seen
  ("Staging mock data" in the platform conventions).
- No cards in cards, no uppercase eyebrows, no emoji as icons.

## App-specific conventions

- **Money is integer hundredths everywhere.** Every amount column is
  BIGINT and holds hundredths of the currency unit regardless of the
  currency's own decimals: RM 4.50 is 450, Rp 15.000 is 1500000. Only
  `public/money.js` knows each currency's digits (0 for IDR/JPY/VND/KRW/
  TWD, 2 for the rest) and formats or parses text. Never store floats.
- **Times are shown in the shop's time zone**, from `shops.time_zone`,
  and all period maths starts from `req.now` (the platform preview
  time), never the server clock or `NOW()`.
- **All sales, payout and staff tables are `staging:private`** (see the
  `COMMENT ON TABLE` lines in `lib/schema.js`). Keep it that way for any
  new table that holds shop activity.
- **Demo data only through `?demo=1`.** `lib/demo.js` seeds the demo shop
  when `IS_STAGING && req.query.demo === '1'`, guarded by an advisory
  lock and an `ON CONFLICT DO NOTHING`. Never return or create demo data
  without the flag.
- **Permission keys:** `register`, `products`, `finance`, `insights`,
  `staff` (boolean `can_*` columns on `roles`). The Owner role's columns
  are ignored; it always has everything. `lib/api.js` exports pure
  `can()` and `checkRoleChange()` helpers, unit-tested in
  `test/permissions.test.js`.
- **Products and categories are archived, never hard-deleted**; sales
  keep their prices as recorded at sale time (the server reprices from
  the current catalog when a sale is posted).
