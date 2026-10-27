# Edgeboard

A private-on-device sports combo workspace for Polymarket US. Discover real markets, construct candidate native-combo tickets, and track only wagers and money you explicitly confirm.

**Live application:** https://seeingitlol.github.io/edgeboard/  
**Repository:** https://github.com/seeingitlol/edgeboard

Check [TESTING.md](TESTING.md) for deployment status and verified versus unverified integrations. The original Pages deployment was verified on October 27, 2026; see the report for the latest patch verification limits.

## Using the app

1. Confirm the amount actually deposited in your wallet. The configured $25 is not available until confirmed.
2. Open **Games**, choose a sport and time window (default next three hours), and inspect market/research details.
3. Open **Combos**, choose 2×, 3×, 4× or 5×, and generate candidates. The app refreshes the order book before eligibility checks. Drafts never count as wagers.
4. Copy a candidate and reproduce it in Polymarket's native Combo interface. Verify the actual accepted ticket, eligibility and payout there.
5. Return to **My Bets**, upload your screenshot, correct OCR fields and selections, then confirm the real wager. Confirm received settlement separately.
6. Record actual savings transfers under **Goals**. The expected $900 payment on November 5, 2026 remains separate and unreceived until confirmed.

Open matches whose scheduled time has elapsed can appear in a separate **Awaiting start** section when the feed explicitly still reports not live/not ended. The window filter does not invent a new start time. Disable the awaiting-start toggle for strict future-only results. Awaiting entries older than 12 hours, suspended matches and unknown lifecycle states stay excluded. Fresh quotes are still required for every combo leg.

No trading credentials are requested and no wager is ever submitted by this app.

## Included

- Dynamic US sports catalog, paginated events, progressive display, duplicate protection, time/search/sport filters, Pacific timestamps and open-market checks.
- Complementary midpoint probabilities distinguished from executable long/short buying quotes. Spread and available share depth are shown honestly; dollar liquidity is unavailable in the selected feeds.
- Two-competitor full-match winner validation. Three-way soccer/Yes-No props remain browsable but are excluded from two-outcome combo construction.
- 2–6 leg combo search over up to 40 verified candidates, 2×–5× targets, labeled nearest alternatives, stale-book rejection, duplicate/shared-team exclusions, research-required toggle and manual native-ticket handoff.
- Local OCR, editable confirmation, IndexedDB wager/image storage, receipt accounting, branch reservations, goals, JSON restore/export and CSV export.
- Bankroll chart, daily/weekly realized P/L, performance by sport/target/leg count and streaks.
- Secure optional Cloudflare Worker + Apps Script snapshot synchronization, retry queue, acknowledgment and stale-revision rejection.
- PWA manifest, offline app shell, update handling and open-app notifications.

## Research coverage and limits

The free TheSportsDB team adapter attempts exact identity matches for **both teams** and displays available completed results in last-5/10/20 windows, with missing counts. Free histories can be home-only, short, stale or incomplete. They do not justify a winner prediction. Its update frequency is not guaranteed; Edgeboard caches retrievals for one hour.

Tennis, table tennis and esports currently show **Research Unavailable**: no dependable free current ranking, injury, surface, map or roster source is connected. Team histories are labeled limited evidence. There is **no independently validated probability model**, so there is no independent winner lean or calibrated confidence score. Enabling “require supported research” will correctly produce no tickets with these adapters. Default candidates are market-derived, explicitly labeled as such.

A product of buying-quote reciprocals is only a reference multiplier, not a native executable Combo offer. Multiplying market-implied probabilities assumes independence. Shared-team/event exclusions do not eliminate all correlation. Eligibility and final payout must be confirmed in Polymarket.

## Architecture

| File | Responsibility |
|---|---|
| `index.html`, `styles.css`, `app.js` | Responsive interface and flows |
| `engine.js` | Pure money, validation, market, combo and settlement logic |
| `data.js` | US market and research adapters |
| `store.js` | Atomic IndexedDB ledger updates, exports, sync queue |
| `worker.js` | Optional allowlisted proxy and authenticated sync bridge |
| `Sheets.gs` | Private six-tab Google Sheets receiver |
| `sw.js`, `manifest.webmanifest`, icons | Installable app and shell cache |
| `tests.mjs`, `fixtures/` | Unit tests and captured public response fixtures |
| `.github/workflows/pages.yml` | Tests and GitHub Pages deployment |

The frontend has no build dependencies. OCR is lazy-loaded from Tesseract.js 6.0.1 on jsDelivr; language data is downloaded on first use. Recognition runs on-device. Google Fonts loads fonts; system fonts are the fallback. Neither provider receives wager screenshots from this code.

## Development

Requires Node 22 or newer for tests. Run `npm test` and `npm run check`. Serve with `python3 -m http.server 8080` or any static HTTPS server. No npm install is needed for the app. See [SETUP.md](SETUP.md) for browser-only GitHub Pages, Sheets/Worker, iPhone and Telegram instructions.

Screenshots remain in the browser's IndexedDB and are excluded from JSON/CSV/Sheets exports. Browser data can be cleared or evicted; export your ledger regularly and keep original receipts. Use one primary device; Sheets synchronization is a backup, not a multi-device merge service.

## Sources

- [Polymarket US documentation](https://docs.polymarket.us/)
- [Public US gateway](https://gateway.polymarket.us/v2/sports)
- [TheSportsDB API documentation](https://www.thesportsdb.com/documentation)
- [TheSportsDB terms](https://www.thesportsdb.com/terms)
- [Tesseract.js](https://github.com/naptha/tesseract.js)
- [GitHub Pages deployment](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

This project is not affiliated with Polymarket. No illustrative fixture or invented game is loaded into the production market list.
