# Meridian: setup
Run locally (Windows/Mac/Linux, Node 22+):
1. `npm install`
2. Create `.env` from `.env.example` and put your CPX secret in it (never commit `.env`).
3. `node --env-file=.env server.js` then open http://localhost:3000

Deploy (Render/Railway): set env vars CPX_APP_ID, CPX_SECRET, USER_SHARE, and DB_PATH (path on a persistent disk, e.g. /data/meridian.db). Start command: `node server.js`.

CPX postback URL (use your real domain):
https://YOURDOMAIN/postback?status={status}&trans_id={trans_id}&user_id={user_id}&amount_usd={amount_usd}&hash={secure_hash}
Verify placeholder names and the hash formula against CPX docs (see ASSUMPTION comments in server.js).

Payouts are manual: review the `payouts` table, pay via PayPal only after CPX has paid you, then set status='paid'.

Email verification: set RESEND_API_KEY (and MAIL_FROM on a domain verified in Resend). If RESEND_API_KEY is empty, accounts are auto-verified.
