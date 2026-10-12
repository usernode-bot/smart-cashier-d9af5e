# Smart Cashier

A simple point of sale for small merchants, with staff roles. Built for
the Homeroom platform.

The owner sets up the shop once: name, currency (30 to choose from, from
ringgit to rupiah to naira) and time zone. After that the register screen
is the whole daily job: tap products onto a paper receipt, tap Charge,
record how the customer paid (cash with change given, card, or QR). Sales
land in Finance, where the owner sees a summary, every transaction, and
logs cash payouts. Insights shows sales per day, best sellers and the
busiest hours so the owner knows when to schedule staff.

Every person signed in to the shop has a role: Owner (always everything),
or roles the owner defines with any mix of five permissions: register,
products, finance, insights and staff. A cashier sees only the register;
a manager can see finance without being able to change staff.

On staging, open the app with `?demo=1` to walk through a made-up demo
shop, Senja Coffee Corner, seeded with products, staff and about two
weeks of sales.

## Layout

- `server.js` and `lib/` — Express API, schema, demo seed, stats helpers
- `public/` — the single-page front end (vanilla JS, no framework)
- `test/` — unit tests for money, stats and permission rules (`npm test`)
- `design/sketch.json` — the screen sketches this build followed

## Platform notes

Sign-in, the database and staging all work the Homeroom way; see
`CLAUDE.md` for app-specific conventions and
https://app.onhomeroom.com/claude.md for the platform rules.
