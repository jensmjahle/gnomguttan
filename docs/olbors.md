# Ølbørs

Ølbørs is integrated into Gnomoseum at `/olbors`, using React, the existing
Gnomguttan theme variables, VoceChat authentication and Gnomguttan's MongoDB.
The old Vue/PostgreSQL service is not needed for normal operation.

## Functionality

- Exchanges: create, rename, upload image, draft/live/closed status.
- Per-exchange admin/regular roles. The creator becomes admin. An admin can
  promote or demote existing Gnomguttan users; the final admin cannot be removed.
  Being a global Gnomguttan admin does not automatically grant control over all exchanges.
- Beer management: names, brewery, style, description, ABV, IBU, images, price
  bounds, base/current price, position, active flag, serving volumes and optional stock.
- Members join using their Gnomguttan identity. Historic customer records remain
  available. Admins can link them to users and merge a newly joined customer into
  a historic customer, preserving receipts and recording original customer IDs.
- Customer profiles, volume/spend/promille rankings, beer statistics, chart ranges,
  complete paginated transaction history and hourly winners/losers.
- Server-calculated receipts include volume scaling, configurable fixed/profile
  commission in kroner and percent adjustments. Historic receipts keep their
  original totals. Client-supplied totals are ignored. Stale quotes require review.
  Admins set `maxUnitsPerPurchase` under "Kjøpsregler" (integer 1–100, default 1,
  including imported exchanges without the field). The server enforces the limit
  inside the atomic purchase update. The dialog respects live limit changes.
  Existing receipts and idempotent retries remain valid after lowering the limit.
  Idempotency keys prevent duplicate purchases. The receipt's `unit_price` field
  retains the legacy meaning (the entire receipt including quantity and commission);
  `total_price` makes that meaning explicit. Spend totals count each receipt once.
- Server-sent events refresh clients immediately after committed changes. Four-second polling remains a fallback, with cleanup and visible failure states.
- Volume-aware pricing and administrator controls are in `server/olbors-pricing.js`.
  Promille uses an estimate, not a measurement.

## Kiosk

An exchange admin can open `/olbors/:eventId/kiosk?key=...`. This route has no
Gnomguttan navbar, footer or login requirement. The unguessable key grants only
read access and can be rotated by an exchange admin. Customer private profile
fields are omitted. QR codes and the fullscreen button are removed from the kiosk.
On desktop, six beers are shown per page, rotating every 15 seconds when needed.
The browser can still be put into fullscreen using its normal controls.

## Storage and deployment

Mongo collection: `olbors_exchanges`; each exchange contains its beers, customers,
receipts and price history. Purchases use a versioned atomic compare-and-swap so
stock, prices, receipt and history commit together on standalone MongoDB as well
as a replica set. Failed comparisons retry against fresh prices and stock.

Documents are capped at 14 MiB, below MongoDB's 16 MiB limit. A write that exceeds
this limit is rejected without partially changing the exchange. For very large
long-running markets, split history into separate collections with replica-set
transactions before that limit is approached.

Images live in `OLBORS_MEDIA_DIR` (default `data/olbors-media`) and are served at
`/olbors-media/`. Docker Compose adds an `olbors-media` volume at `/data/olbors-media`.
Exchange image uploads (`purpose: "exchange"`) are admin-only and have no configured
file or request size cap. The image endpoint has a dedicated JSON parser so the
general 15 MB API limit does not reject them. PNG/JPEG/WebP validation remains.
Beer uploads retain their existing 5 MB limit. Tests verify a 16 MB exchange image.
Keep that volume on redeploy. The imported local media files must be copied into
the deployment's mounted directory if deploying on another host.

Deploy the rebuilt Gnomguttan image/app and restart its backend to expose the new
routes. This integration does not automatically deploy or shut down Beer Exchange.
After cutover, stop accepting purchases in the old application; rerunning the
import deliberately does not replace exchanges already imported into Gnomguttan.

## Migration

The importer connects directly to the configured persistent MongoDB. It never
uses the development in-memory fallback. PostgreSQL is read using one read-only
repeatable-read snapshot. All source tables, including legacy admin metadata,
are backed up under ignored `data/olbors-migration/<timestamp>/source.json`.
Legacy password hashes remain in this private backup and are not used for login.

Set `BEER_EXCHANGE_DIR` or `BEER_EXCHANGE_DATABASE_URL`, `BEER_EXCHANGE_API_URL`,
`MONGODB_URI`/optional `MONGODB_DB`, and `OLBORS_USER_MAP` in the local environment.
The user map contains explicit numeric Gnomguttan UIDs, for example:

```json
{
  "admins": { "old-exchange-uuid": [1] },
  "customers": { "old-customer-uuid": 1 }
}
```

```powershell
npm run migrate:olbors
npm run migrate:olbors -- --apply
```

The default run is a dry run. Applying validates admin/customer mappings,
foreign references and document sizes before inserting. Existing imports are
preserved with `$setOnInsert`; import ID collisions are rejected. All imported
record IDs are checked afterward. Uploaded files are backed up and verified
using SHA-256. No source tables are changed or removed.

If the old backend returns 404 for already missing files, the default import
stops. `--allow-missing-media` imports the database while preserving the original
remote references and recording filenames in `missing-media.json`. Restore
those files from an old uploads backup and update the relevant image URLs to
`/olbors-media/<filename>` afterward.

### Migration performed 8 October 2026

- Exchange: Gjødebord 2025, ID `6ad00cf5-750a-445d-b815-098cac13ccfe`.
- 6 beers, 11 customers, 61 receipts, 366 price updates.
- First exchange admin: Jens Martin (UID 1). His historic customer is linked.
- Other customers are preserved without guessed identity links. Gnomguttan had
  only UID 1 registered at import time. Others appear in the admin user selector
  after they sign in to Gnomguttan.
- Backup: `data/olbors-migration/2026-10-08T12-19-40-976Z/`.
- 11 customer profile images were already missing from the old backend (HTTP
  404) and local uploads. See that backup's `missing-media.json`.
- Source PostgreSQL database retained unchanged.

For rollback, the original PostgreSQL database is still intact. Do not delete
the Mongo exchange or media volume after users have started buying; preserve
new receipts first. `destination-before.json` records the pre-import destination.

## Validation

```powershell
npm run build
npm run lint
npm run test:olbors
```

Backend integration tests use an isolated MongoMemoryServer, never the live DB.
They exercise role boundaries, last-admin protection, linking and merging,
server pricing/commission, idempotency, concurrent stock updates, kiosk revocation,
private profile fields, complete history pagination and bounded price changes.

Browser QA uses a copy of the imported exchange in an isolated database with
local test authentication. Production data and actual login credentials are
not used for mutations. Browser plugin was unavailable; bundled Playwright
with installed Edge was used at 1440×1000, 390×844 and 1920×1080.

| Check | Result |
| --- | --- |
| TypeScript / production build | Passed |
| ESLint (zero warnings) | Passed |
| Backend integration + pricing + analytics + live updates + market events | 28 tests passed |
| Correct page identity and meaningful content | Passed |
| Framework error overlay | None |
| Relevant browser console / runtime errors | None |
| Desktop and mobile layout | Passed; no horizontal page overflow |
| Kiosk at 1920×1080 | Passed; no navbar, QR or fullscreen button, six beers per page and automatic rotation |
| Interaction proof | Create exchange, change roles, add beer, change status, purchase, edit profile, full history, beer chart ranges and point navigation, customer breakdown, add existing Gnom user, immediate live updates |
| Source/destination comparison | IDs and all non-media source fields verified; imported exchange version still 0 |

The Browser plugin can optionally be installed for future in-app browser QA.

## Original application functionality

The original deployed event was inspected through its market, purchase dialog,
beer detail ranges, customer detail and settings. Beer details include timestamped
price charts, change percentages, historical extremes, best/worst purchases,
sales totals, volume-weighted prices and top customers. Customer details include
profile data, totals and an expandable alcohol estimate based on recorded volumes
and ABV. The estimate is informational and does not indicate fitness to drive.

The market includes customer rankings, recent purchases and hourly price movers.
Existing Gnomguttan users can be added by an exchange admin; separate Beer Exchange
accounts are replaced by Gnomguttan authentication. The application uses Gnomguttan's shared theme settings. The integrated UI
uses Norwegian labels. The original games/about placeholders are not separate features.

Closed exchanges open a dedicated results overview instead of the market. It
includes three podiums (volume, spending and historical peak BAC), complete
rankings containing every participant, exchange-wide statistics,
the signed-in participant's totals and favorite, and links to full and personal
history. Awards use recorded purchases: audience favorite by distinct buyers,
bestseller by quantity, explorer by distinct beers and best deal by actual paid
price per liter. All aggregates use the complete stored history, including legacy
receipt totals. Empty exchanges have explicit empty states. Public kiosks display
the results and awards without personal statistics; reopening restores the market.
The closed overview omits the recent-purchase block; its history button opens
the complete paginated history. Closed participant pages and rankings use peak
BAC too. Peaks are calculated chronologically from recorded ABV and volume,
with elimination between purchases clamped at zero after sober gaps. They do
not decay with the current time. Missing weight is unranked and displayed as "–".

On screens below 640 px, exchange tabs and header actions are grouped in an
independent exchange menu beside the event title, including admin-only actions.
The main Gnomguttan hamburger stays separate. Desktop keeps
the existing tabs. Mobile beer cards place name, price and a 40 px purchase
button on the same row, retaining the price meter and serving sizes below.
Hourly movers share a compact two-column row; purchase history uses compact
stacked rows. Browser checks cover 320, 390, 430 and 620 px, all menu actions,
purchase dialog entry, navigation from details and the closed results view.

Normal page sections have consistent vertical gaps. Participant rows use the
full width without per-participant edit buttons; "Min profil" edits the linked
signed-in participant. Profile fields are readable and writable only by their
owner, including when the viewer is an exchange admin. Admins retain historical
identity linking/merging. Applicable commission rates are provided separately
for authorized purchases without disclosing another participant's profile fields.

Linked participants use the main Gnomguttan account avatar across lists, detail
pages and live/closed podiums. Snapshots include the account avatar version to
refresh changed pictures. Separate exchange profile image editing is removed;
unlinked legacy customers retain imported image references and initials fallback.

## Pricing algorithm and simulations

Admins have a dedicated "Prisalgoritme og tapsvern" section. Defaults are 4%
price sensitivity per 500 ml, 8% maximum normal movement per purchase, 1% mean
reversion, a 500 kr loss budget and a 10% recovery markup. Protection is enabled.
Default cross-impact is 100%, target margin is 5% of sold cost and margin response
is 5%. Admins can adjust cross-impact from 0–300%, target from 0–50% and response
from 0–30%. The target is an objective, not a guaranteed result.
The percentages use each beer's absolute base price (at least 1 kr/L). Sensitivity
is configurable from 0–30%, normal movement from 0.1–50%, reversion from 0–20%,
loss budget from 0–1,000,000 kr, and recovery markup from 0–100%.

Purchased volume increases that beer's price; the actual increase is distributed
across other active beers according to available room above their minimums.
Cross-impact scales the reduction of other beers independently of the bought
beer's increase. Mean reversion moves prices toward the greater of base price
and cost plus target margin, without reversing buying pressure. House regulation
responds to the gap between actual house balance and target profit: losses make
the purchased beer rise more and other beers fall less. In normal operation the
purchased beer rises and unpurchased beers fall; at least half the demand movement
survives reversion and house regulation. Disabled pressure/coupling and price bounds
can keep a price unchanged. During recovery, buying pressure still applies, but
explicit emergency floors may raise unpurchased beers. A
normal move is capped and all prices respect each beer's min/max. Inactive beers
are unchanged. Emergency protection explicitly overrides the normal step cap.

House balance is complete receipt revenue (including commission) minus the cost
of sold liters. Old `unit_price` fields contain full receipt totals and are
counted once. Each new receipt captures cost per liter at purchase time, so later
cost edits do not alter that receipt's result. Without an entered purchase cost,
base price is used and the receipt is marked estimated. Imported receipts without
captured cost use the beer's base price as an estimate. Fixed expenses and unsold
inventory are not included; enter actual costs for meaningful protection.

If a quoted purchase would increase the loss beyond the budget, a CAS update
raises active prices to at least cost plus recovery markup, within their max
prices. It records price history and returns HTTP 409 asking for confirmation of
the new quote. No stock or receipt changes at this step. The same purchase ID can
be retried safely. If max prices cannot cover the cost, loss-increasing purchases
are rejected. Profitable purchases remain possible even with inherited debt.
Emergency pricing persists until balance recovers above half the loss budget.
Admins can explicitly disable protection. Changing controls takes effect on
subsequent purchases; existing receipts and source data are preserved.

Run `npm run simulate:olbors -- 200` to reproduce the checked-in JSON and Markdown
reports in `reports/`. This runs 6,600 new-algorithm events and 1,600 legacy events,
each with 6 beers, 10 participants and 200 purchase attempts: 1.64 million attempts.
There are eleven behavior/stress scenarios and three aggressiveness presets, with
seeds 1–200. The simulation asserts finite/bounded prices, normal movement limits
and loss-budget enforcement. The stress budget is 150 kr; deliberately inherited -650 kr debt
was allowed to recover without further loss. Impossible max prices blocked sales,
where the legacy algorithm continued losing money. These are synthetic behaviors,
not a guarantee of real-world profit.

Browser QA additionally verifies saved admin controls on desktop/mobile, cost
editing and the protected quote -> new confirmation -> one committed receipt flow.

## Own-account checkout, profile, commission and adjustments

Purchases always belong to the authenticated user's linked participant, including
for admins. The participant selector is removed. A profile needs positive weight,
height and shoe size, plus gender, work relationship and marital status. Extra
profile fields used by commission rules also become required. A buy attempt with
missing fields opens a popup linking to the participant's own profile editor;
the API independently rejects incomplete profiles before committing a purchase.
Telephone, sexual orientation and ethnicity remain optional and private.

Admins configure fixed commission in kroner per purchase, or a base amount plus
matching profile rules. Supported fields are work relationship, marital status,
height, weight, shoe size, gender and experience. Rules support equality and numeric
thresholds. All matching amounts add together; normal participants only receive
the final fee, never the rule configuration or the reason for their fee.

Percent adjustments apply to the beer subtotal; fixed commission is added afterward.
Optional rules reward the live BAC leader, sold volume and different beers tried,
or add surcharges for low BAC, volume or variety. The default grace period is 30
minutes after the first purchase and at least three exchange-wide purchases.
Optional random rules are stable for each participant/time window, preventing
rerolls by reopening a dialog or changing beer. Presets are Søtnosrabatt (-10%),
Gnomrabatt (-10%), Fedmepåslag (+5%) and Stygg i tryne (+5%); admins can rename,
add, remove and change their percentages. Labels are random, not classifications
of a participant's body or appearance. Adjustments and random draws are disabled
by default; default fixed commission is zero until configured.

The dialog displays personal adjustments only below the commission line. Quotes
are generated on the server, stored for two minutes and validated against user,
beer, volume, quantity, current price, fee configuration and profile before purchase.
Receipts retain the fee, adjustment percent, labels, subtotal and offer reference.
Quote documents expire by TTL; receipt/history data is not removed by that TTL.
Existing imported receipts are not recalculated. The live BAC model now also
resets at zero between drinks after long sober gaps, matching the historical peak
calculation rather than continuing to subtract burnoff from already eliminated alcohol.

## Supertilbud and beer detail pages

Supertilbud is an optional automatic event every configurable interval (default
15 minutes). It selects an active, stocked beer not excluded by the administrator
and temporarily quotes its minimum price or a configurable percentage discount.
Default capacity is one distinct buyer and maximum duration is five minutes.
Each participant can use a specific offer once; repeat purchases during the same
offer use the current underlying market price. Slots, receipts and stock commit
atomically; concurrent buyers cannot both take the final slot. Selling out,
expiration, disabling offers, closing the exchange and loss protection restore
the latest underlying prices and log complete price sets immediately. Automatic
offers are off by default; admins can test one with the manual draw button.

`/olbors/:eventId/beer/:beerId` renders a dedicated beer view with a back link,
image/icon, prominent price and change, own-account buy button, beer facts and
chart on the right on desktop. Mobile stacks the identity and chart before trade
statistics. Best/worst trades and top customers use main-account profile images.
The exchange beer-card grid is not mounted on this route. Historical purchases
remain below the detail content. Admin crack/boom controls have separate explained
cards, with shared duration, cooldown and trigger settings. Each adjustable
event field explains its effect, including the distinction between random draw
frequency and probability. An admin-only section navigator links directly to
events, offers, checkout, pricing, beers and roles; cards stack on mobile.

Two independent authenticated live streams and browser sessions were tested:
the other participant received the committed price in approximately 500–650 ms.
A follow-up test disabled the four-second polling fallback and checked that both
SSE streams were open; the other browser updated in 623 ms after the purchase.
Participant profile changes use the same live updates; the manual
refresh button is removed. Transport is SSE, with four-second polling as fallback.

## Temporary market events and continuous history

Exchange admins can start a crash or price surge, set its strength and duration,
and stop it early. Prices still respect beer minimums and maximums. Purchases
continue adjusting underlying normal prices during an event; expiration restores
those latest prices. Closing an exchange ends its active event. Emergency loss
protection cancels temporary effects and prevents crashes while protection is active.

Automatic events are disabled by default. Admins can enable a crash after a set
amount of new profit or a profit percentage relative to newly sold cost. Profit
anchors reset when an event starts, preventing repeated crashes from the same
profit. Random events have a configurable interval, chance and crash/surge/mixed
type. Duration and cooldown prevent overlapping automatic events. Defaults are
a 35% crash, 25% surge, 120-second duration and 600-second cooldown.

The backend checks live exchanges every five seconds, independently of open
browser tabs. Purchases also check expiration before accepting a quote. It records
all beer prices every 30 seconds in `olbors_price_ticks`, with unique exchange/time
buckets and no automatic retention deletion. These samples do not grow the embedded
exchange document. Purchases, beer edits, event start/end and exchange opening/
closing additionally record complete price sets atomically in the exchange.
Charts merge imported history, changes and periodic samples, displaying prices
as steps rather than interpolated slopes. Browser QA verifies mobile admin
controls, live and kiosk banners, purchases during a crash, expiration, manual
stop and complete six-beer samples using an isolated database.
