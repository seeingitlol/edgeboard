# Edgeboard setup — browser only

## GitHub Pages

The intended new repository is `seeingitlol/edgeboard`; do not use an existing project.

1. If source has not yet been published, extract the supplied ZIP on your Chromebook. Open the new repository → **Add file → Upload files**. Upload the contents inside the `edgeboard` folder, not an extra nested folder. Include the icons and all JavaScript/CSS/HTML files. Commit to `main`.
2. If your file picker hides `.github`, create `.github/workflows/pages.yml` using **Add file → Create new file** and paste that file from the ZIP. Alternatively use Pages' classic branch deployment after uploading the static files.
3. Open **Settings → Pages → Build and deployment → Source → GitHub Actions**.
4. Open **Actions → Deploy Edgeboard → Run workflow** if a push did not already start it. The build runs the tests, assembles the static files and deploys the Pages artifact.
5. Wait for the green deployment. Open the URL reported in the deployment: `https://seeingitlol.github.io/edgeboard/`.
6. On future changes, commit to `main`; the workflow redeploys. For shell changes, increment the version in `sw.js`. The new worker activates after old tabs close; it does not delete IndexedDB.

The initial browser publishing workflow may include a one-time compressed source bootstrap. It only executes when `engine.js` is absent, commits the source, and never overwrites an established checkout. Once initialized it can be replaced with the short normal deployment workflow from the ZIP.

## Private Google Sheets backup

A six-tab private workbook is supplied separately in the chat. Its ID and URL are intentionally absent from the public repository. The public website cannot write to your Google account by itself.

### 1. Configure Apps Script

1. Open your private workbook → **Extensions → Apps Script**. Replace `Code.gs` with the contents of `Sheets.gs` from this repository.
2. Open **Project Settings → Script Properties** and add:
   - `SHEET_ID`: the workbook ID between `/d/` and `/edit` in your private Sheet URL.
   - `SYNC_SECRET`: a long, random unique password (at least 32 random characters). Store it privately.
3. Save. Select `setup` and click **Run**. Review Google's requested access and authorize your own project. The script creates any missing tabs and does not make the workbook public.
4. Click **Deploy → New deployment → Web app**. Execute as **Me**, access **Anyone**. The endpoint is reachable publicly but rejects requests without the shared secret; the Sheet remains private. If an account policy prevents this deployment mode, this integration cannot be used without a different authenticated backend.
5. Copy the web app `/exec` URL. Never put `SYNC_SECRET` in the frontend or GitHub. Future code edits require **Deploy → Manage deployments → Edit → New version → Deploy**.

### 2. Configure the optional free Worker

A Worker is required for secure Sheets sync; it is optional for public market browsing when direct CORS works.

1. Open Cloudflare Dashboard → **Workers & Pages → Create → Worker**. Choose the free plan; do not activate paid services for this project.
2. Open **Edit code**, paste `worker.js`, and deploy.
3. In the Worker's **Settings → Variables and Secrets**, set:

| Name | Type | Value |
|---|---|---|
| `ALLOWED_ORIGIN` | Text | `https://seeingitlol.github.io` — no path or trailing slash |
| `GAS_URL` | Secret | Your deployed Apps Script `/exec` URL |
| `GAS_SECRET` | Secret | Exactly the Apps Script `SYNC_SECRET` |
| `APP_TOKEN` | Secret | A second independent random password, at least 32 characters |

4. Redeploy after changing variables. Keep the `workers.dev` URL.
5. In Edgeboard → gear → **Google Sheets & optional proxy**, paste the Worker URL and `APP_TOKEN`. Save. The app stores the URL locally; the token stays in session storage and must be re-entered after the session ends.
6. Press **Sync now**. This can send an empty ledger with the configured goals; it does not invent wagers. Only **Synced [time]** means the backend acknowledged your snapshot. Check the six Sheet tabs and confirm there are no wager rows before your first real ticket.

### Failure and recovery

- Local changes commit before sync. Failed requests remain queued and retry while the app is open. Offline use does not silently drop changes.
- Retries use operation IDs and deterministic snapshot rebuilds, so replay cannot append duplicate bets. The receiver acknowledges only after Sheet writes and flush succeed.
- Use one primary device. Remote newer revisions are rejected. Export both copies and reconcile manually if you switch devices; do not blindly reset the remote revision. Export JSON on the old device, restore it on the new device, then reconnect.
- JSON excludes endpoint credentials and images. Keep original screenshots separately. CSV is a reporting export; restore uses validated JSON.
- Do not manually edit the generated tabs as a separate ledger: the next acknowledged snapshot rebuild replaces their generated rows. Add separate tabs for your own notes.
- Apps Script does not offer atomic transactions across six tabs. A failed run may leave a partial sheet update but returns no success; retry rebuilds the complete snapshot. The device ledger stays authoritative.
- Large workbooks may reach Apps Script/Worker quotas. The Worker rejects payloads over 1.5 MB and reports failure. Export locally before archiving old records; no automatic deletion occurs.
- A 401/403 means check `APP_TOKEN`, origin and deployment settings. A 409 can mean a newer remote revision or a receiver error. No “success” is displayed without a matching acknowledgment.

### Revoke access

Delete the Apps Script web deployment or rotate `SYNC_SECRET` and `APP_TOKEN`. Clear the Worker URL in app Settings to stop future uploads. Your private workbook remains yours.

## iPhone installation and privacy

Open the published HTTPS URL in Safari → **Share → Add to Home Screen**. Open the installed app once online to cache its shell. Odds require a live connection; cached markets are never treated as freshly verified. Offline combination generation fails closed.

Confirm $25 only if it is actually in your wallet. Confirm the November 5 payment only after receiving it. Settings offer stake/risk, daily-loss and withdrawal reminders, but never place or increase stakes automatically.

OCR downloads its engine and English language data once needed. Screenshots are processed locally. Review every extracted amount and selection. No screenshot is silently sent to Sheets or an AI service.

Notifications are opt-in and checked while the app is open. Static GitHub Pages cannot promise reliable background alerts on iPhone. Closed-app alerts require a push backend, subscriptions and a scheduler, or a Telegram backend; those are not deployed here.

## Optional Telegram Mini App

Use BotFather to create or select your bot, then set its menu Web App URL to the published HTTPS site. Never paste the bot token into this repository or the frontend. The responsive interface can run in Telegram's web view; automatic `ready()`/`expand()` integration is used if Telegram supplies the SDK object. Add the official Telegram WebApp script only if you want that optional SDK loaded.

Telegram and Safari can have separate browser storage. They will not automatically share local wagers. Use a single primary environment or an explicit JSON restore; the Sheet is a backup, not a bidirectional account service. Server-side Telegram identity validation and background alerts would require a private backend.

## Freshness, coverage and support

The catalog is cached for one hour. Event pages refresh approximately every minute while visible, with up to three concurrent requests, bounded retries and cancellation. Scan limits are shown explicitly and can be raised in Settings. Choosing one sport avoids scanning the other sports. Short/full winner types are conservatively allowlisted; unsupported props and draw markets are visible but excluded from combos.

Current free research coverage is described in README. Missing statistics and independently modeled win probabilities are unavailable, not inferred from odds. No paid AI or sports API is required for the included version.
