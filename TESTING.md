# Verification report

Checked October 27, 2026. This file reports observed results rather than assumed completion.

## Passed

- **29 automated tests**, zero failures: money remains unavailable until confirmed; stake versus profit; losses/cash-outs/voids; duplicate tickets/images; branch reservation and double-spend prevention; received-payment allocations; market parsing; draw/prop exclusions; suspension; schedule fields; time/sport/favorite filtering and sort; BBO conversion; 2×/3×/4×/5× construction; shared-event/team/stale/mixed-venue rejection; unsupported research; fractional US settlement; labeled OCR text; backup validation; pagination, caps/repeated pages and connection errors; proxy method/origin/auth rejection.
- JavaScript syntax checks for `app.js`, `engine.js`, `data.js`, `store.js`, and `worker.js`.
- **Live public US gateway calls** from the development environment: 26-sport catalog, multiple event pages, tennis/table-tennis/esports/basketball/football/soccer response shapes, and an open market's BBO. Actual public samples are committed under `fixtures/` and are not loaded by the app.
- Pagination observed with different offsets; response parsing tested against captured real data. Soccer three-way Yes/No winner markets were excluded from two-competitor combo tickets. NBA/football full-game market types were added after inspecting actual responses.
- CORS response from the public gateway accepted the intended GitHub Pages origin during the development check. This is not a substitute for testing the deployed browser.
- Official US Combo and settlement documentation checked: eligible native tickets are supported; cancelled legs may settle fractionally at last fair market price. No automatic assumption that a leg is simply removed.
- New public `seeingitlol/edgeboard` repository created through the signed-in browser, separate from existing projects.
- Private Google Sheet created with all six requested tabs. API metadata confirmed only owner permission and `shared: false`. Six local rendered workbook previews were visually inspected before native import. No wagers, deposited funds, or received payments were fabricated.

## Not yet verified / blocked

- **GitHub publication and live Pages deployment remain pending.** The connected GitHub app is authenticated as a different account and lacks push permission on `seeingitlol/edgeboard`. Browser access subsequently lost its originating context before source upload/deployment. The complete source, normal deployment workflow and browser-only instructions are supplied in the ZIP. The target website URL is not a claimed live deployment.
- Published desktop/iPhone browser flows, responsive visual QA and actual iPhone installation are unverified until browser access returns and deployment succeeds.
- OCR's labeled-text parser is tested; full screenshot recognition, image upload and confirmation in the deployed browser are unverified. The free OCR engine may misread or miss fields. Selections and dates must be reviewed manually.
- Accounting is unit-tested; end-to-end IndexedDB mutation, browser reload persistence, exports, restore, image storage and multi-tab transaction behavior still need browser verification.
- Sheets/Worker source is complete but the Apps Script authorization, web deployment, private secrets and Cloudflare Worker have **not** been configured. No successful automatic synchronization is claimed. Local queue/receiver behavior needs an end-to-end authenticated deployment check.
- Public settlement formulas are unit-tested. No user's real private wager was queried, placed, settled or credited. Actual receipt always requires user confirmation.
- PWA file structure and cache logic are included; offline launch, update activation and notification delivery are not yet browser-tested.
- Telegram webview compatibility is implemented at a basic responsive/optional-SDK level; no bot or menu has been configured or tested.

## Explicit limitations

- No independently validated win-probability model or independent winner prediction is connected. Free team results are limited evidence; tennis/table-tennis/esports research is unavailable. Market favorite is not a research-supported winner.
- Only conservative two-competitor full-match winner types enter combo construction. Unsupported sports/props remain discoverable but cannot automatically become eligible tickets. Adding new types requires inspecting their real outcome semantics.
- Combo search checks the earliest 40 filtered markets, then researches up to 12 eligible candidates and re-verifies their books. It returns up to three candidates within 15% of the requested reference multiplier, or an explicit empty result.
- Native Combo executable price, minimum wager, eligibility, fees and payout must be verified inside Polymarket; reference odds are not an executable offer.
- Event scan is bounded to 20 pages per sport by default, configurable to 100, with explicit incomplete-coverage messages. Network/API changes can interrupt or limit discovery.
- Screenshots stay local and are not in JSON/CSV or Sheets backups. JSON restores the ledger; CSV is export-only. Multi-device bidirectional synchronization is not implemented.
- Daily/weekly/per-category charts need actual settled records; empty states are intentional. Background alerts while the PWA is closed are not implemented.

## Remaining live acceptance checks

1. Reconnect the originating Chrome extension, publish source and run Pages workflow. Verify the final URL returns the application, not README or 404.
2. Inspect all five screens at 390×844 and desktop. Confirm no horizontal overflow, readable cards, working dialogs and tappable navigation.
3. Load actual markets, switch sports/time windows, search, inspect Pacific starts and BBO/research details; test every target when sufficient eligible markets exist. Do not force a combo when none qualifies.
4. On an isolated test origin or test browser profile, confirm synthetic ledger flows, reload persistence, image OCR/manual correction, duplicate rejection, JSON round trip and branch allocation. Do not add test tickets to the user's real ledger.
5. Configure private sync, send an empty initial snapshot and observe matching acknowledgment plus workbook rows. Disconnect network, make an isolated test change, reconnect and ensure replay produces one record only.
6. Install on iPhone; inspect manifest/icons, offline shell, stale-quote rejection and a service-worker update without data loss.
