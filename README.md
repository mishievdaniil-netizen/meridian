# Meridian Insights: complete setup tutorial

Users sign up, take CPX Research surveys, and earn 50% of what CPX pays you. You keep the other 50%.

## Part 1: Run it on your computer (optional test)
1. Install Node 22 or newer (nodejs.org).
2. Open the `meridian` folder, click the address bar in File Explorer, type `cmd`, press Enter.
3. Run `npm install` (no Visual Studio needed).
4. Create a file named `.env` (copy `.env.example`) and fill in your real values. Never upload `.env` anywhere.
5. Run `node --env-file=.env server.js`, open http://localhost:3000

## Part 2: CPX Research settings
1. In your CPX app, open REWARD SETTINGS: Currency name `$`, Currency Factor `0.5`, Bonus factor `0.5`, decimals `2`. Save. (Factor 0 makes every reward show +0.00.)
2. Copy your secure hash into Render later. Never paste it in chat, screenshots or GitHub. If it leaks, regenerate it.
3. In POSTBACK SETTINGS paste (use your real Render address):
   https://YOUR-SERVICE.onrender.com/postback?status={status}&trans_id={trans_id}&user_id={user_id}&amount_usd={amount_usd}&hash={secure_hash}
   Check CPX's real placeholder names, the hash formula (md5 of trans_id + "-" + secret) and status codes (1 = completed, 2 = reversed). They are marked ASSUMPTION in server.js.
4. Add your payment information and turn on 2-factor login in CPX.

## Part 3: GitHub
1. Make a repository (Private or Public) on the account that is not blocked.
2. Click Add file, Upload files. Drag in the FILES themselves, not a wrapping folder:
   server.js, package.json, README.md, .gitignore, .env.example, and a folder called `public` containing index.html, manifest.json, sw.js, icon-192.png, icon-512.png, terms.html, privacy.html.
3. Do NOT upload `.env`, `node_modules` or `package-lock.json`.
4. Commit changes.

## Part 4: Email (free, no domain): Gmail app password
1. Use a separate Gmail account for the site (not your personal one).
2. At myaccount.google.com/security turn on 2-Step Verification.
3. At myaccount.google.com/apppasswords create a password named Meridian and copy the 16 letters.
4. Put them in Render as GMAIL_USER and GMAIL_APP_PASSWORD (Part 5).
5. Gmail sends about 500 emails a day, and mail from a Gmail address may land in spam.

## Part 5: Render (hosting)
1. render.com, sign up, New, Web Service.
2. Public repo: choose Public Git Repository and paste its URL. Private repo: connect the GitHub account.
3. Build Command `npm install`. Start Command `node server.js`.
4. Environment tab, add: CPX_APP_ID, CPX_SECRET, USER_SHARE (0.5), DB_PATH, GMAIL_USER, GMAIL_APP_PASSWORD.
   Do NOT set ALLOW_UNVERIFIED or RESEND_API_KEY.
5. Free plan: the database is WIPED on every restart and the site sleeps. Fine for testing only.
   For real users: Starter plan, add a Disk with Mount Path `/data`, and set DB_PATH=/data/meridian.db.
6. Create Web Service. Wait for Live. Open the address.
7. If you see "Cannot GET /", the `public` folder or index.html is not in the repo correctly.
8. If the build says package.json not found, files are inside a wrapping folder: set Settings, Root Directory to that folder name, or re-upload.
9. Changed code on GitHub? Manual Deploy, Clear build cache and deploy.

## Part 6: Test everything
1. Open the site in a private window. Sign up with a real email you own (the 18+ box is required).
2. Render, Logs (set the time range to the last hour): you should see `sending verify mail` then `mail sent`. `mail error` names the problem (wrong app password, wrong GMAIL_USER).
3. Check the Sent folder of the Gmail account. Check spam in the recipient inbox.
4. Click the confirm link. The CPX surveys appear and show real amounts.
5. Complete one survey honestly with your VPN off. Your balance should go up by the shown amount. A screen-out only gives a tiny bonus.

## Part 7: Phone app (APK)
1. Open pwabuilder.com in your browser (nothing to install), paste your Render address, click Start.
2. Package for stores, Android, Generate package. Let it create a signing key and KEEP the key file and password safe.
3. Install the .apk on a phone (allow unknown apps). Upload the .aab to Google Play ($25 account, review can be strict).
4. Quick no-store option: open the site on a phone, browser menu, Install app / Add to Home Screen.

## Part 8: Before real users
1. Fill [YOUR NAME OR COMPANY], [COUNTRY], [DATE] in terms.html and privacy.html and have a lawyer review them.
2. Read CPX's publisher terms. Do not promise earnings. Pay withdrawals only after CPX has paid you.
3. Payouts are manual: look at the payouts table, pay by PayPal, then set status='paid'.
4. Register the business and ask an accountant about taxes in your country.
5. Back up meridian.db regularly. Buy a domain later for a professional look and better email.
