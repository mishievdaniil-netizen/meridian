// Meridian: BitLabs publisher site. Run: npm i && node server.js
// NOTE: No email verification is used. The "email" DB column stores the USERNAME.
const express = require("express");
const { DatabaseSync } = require("node:sqlite");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const cp = require("cookie-parser");

const { BITLABS_APP_TOKEN, BITLABS_SECRET, PORT = 3000 } = process.env;
const SHARE = parseFloat(process.env.USER_SHARE || "0.5");

if (!BITLABS_APP_TOKEN || !BITLABS_SECRET) {
  console.error("Set BITLABS_APP_TOKEN and BITLABS_SECRET environment variables.");
  process.exit(1);
}

const db = new DatabaseSync(process.env.DB_PATH || "meridian.db");
const txn = (f) => { db.exec("BEGIN"); try { f(); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; } };

db.exec(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,email TEXT UNIQUE,pw TEXT,balance REAL DEFAULT 0,earned REAL DEFAULT 0,ip TEXT,ts INTEGER);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,uid INTEGER);
CREATE TABLE IF NOT EXISTS tx(trans_id TEXT PRIMARY KEY,uid INTEGER,gross REAL,credit REAL,status TEXT,ts INTEGER);
CREATE TABLE IF NOT EXISTS payouts(id INTEGER PRIMARY KEY,uid INTEGER,amount REAL,paypal TEXT,status TEXT DEFAULT 'pending',ts INTEGER);`);

const app = express();
app.set("trust proxy", 1);
app.use(express.json(), cp(), express.static("public"));

const me = (req, res, next) => {
  const s = db.prepare("SELECT uid FROM sessions WHERE token=?").get(req.cookies.t || "");
  if (!s) return res.status(401).json({ error: "login" });
  req.uid = s.uid;
  next();
};

const login = (res, uid) => {
  const t = crypto.randomBytes(24).toString("hex");
  db.prepare("INSERT INTO sessions VALUES(?,?)").run(t, uid);
  res.cookie("t", t, { httpOnly: true, sameSite: "lax", maxAge: 30 * 864e5 });
};

// SIGNUP: username + password only, no email verification
app.post("/api/signup", (req, res) => {
  const { username, password } = req.body || {};
  if (!(req.body || {}).agree) return res.status(400).json({ error: "You must be 18+ and accept the Terms and Privacy Policy" });
  if (!/^[a-zA-Z0-9_]{3,30}$/.test(username || "")) return res.status(400).json({ error: "Username must be 3-30 chars (letters, numbers, underscore)" });
  if ((password || "").length < 8) return res.status(400).json({ error: "Password must be 8+ chars" });
  try {
    const r = db.prepare("INSERT INTO users(email,pw,ip,ts) VALUES(?,?,?,?)").run(username.toLowerCase(), bcrypt.hashSync(password, 10), req.headers["x-forwarded-for"] || req.ip, Date.now());
    login(res, r.lastInsertRowid);
    res.json({ ok: 1 });
  } catch (e) { res.status(400).json({ error: "Username already taken" }); }
});

app.post("/api/login", (req, res) => {
  const u = db.prepare("SELECT * FROM users WHERE email=?").get(((req.body || {}).username || "").toLowerCase());
  if (!u || !bcrypt.compareSync((req.body || {}).password || "", u.pw)) return res.status(400).json({ error: "Wrong username or password" });
  login(res, u.id);
  res.json({ ok: 1 });
});

app.get("/api/me", me, (req, res) => {
  const u = db.prepare("SELECT id,email,balance,earned FROM users WHERE id=?").get(req.uid);
  res.json({
    username: u.email,
    balance: u.balance,
    earned: u.earned,
    // BitLabs iFrame URL
    wall: `https://web.bitlabs.ai/?uid=${u.id}&token=${BITLABS_APP_TOKEN}`,
    tx: db.prepare("SELECT gross,credit,status,ts FROM tx WHERE uid=? ORDER BY ts DESC LIMIT 20").all(u.id),
    payouts: db.prepare("SELECT amount,paypal,status,ts FROM payouts WHERE uid=? ORDER BY ts DESC").all(u.id)
  });
});

// BitLabs Postback (Callback) - verifies HMAC-SHA1 hash
app.get("/postback", (req, res) => {
  const { uid, val, tx, hash } = req.query;
  if (!uid || !tx || !hash) return res.status(400).send("missing params");

  // Verify hash: HMAC-SHA1 of the full URL (without &hash=) using the App Secret
  const urlWithoutHash = req.originalUrl.split("&hash=")[0];
  const expectedHash = crypto.createHmac("sha1", BITLABS_SECRET).update(urlWithoutHash).digest("hex");
  if (expectedHash !== hash) {
    console.error("BitLabs hash mismatch. Expected:", expectedHash, "Got:", hash);
    return res.status(403).send("bad hash");
  }

  const gross = parseFloat(val) || 0;
  const u = db.prepare("SELECT id FROM users WHERE id=?").get(uid);
  if (!u) return res.status(404).send("no user");

  const existing = db.prepare("SELECT * FROM tx WHERE trans_id=?").get(tx);
  if (existing) return res.send("OK"); // Deduplicate

  txn(() => {
    const credit = Math.round(gross * SHARE * 100) / 100;
    db.prepare("INSERT INTO tx VALUES(?,?,?,?,?,?)").run(tx, u.id, gross, credit, "completed", Date.now());
    db.prepare("UPDATE users SET balance=balance+?,earned=earned+? WHERE id=?").run(credit, credit, u.id);
  });
  res.send("OK");
});

app.post("/api/withdraw", me, (req, res) => {
  const a = parseFloat(req.body.amount), pp = req.body.paypal || "", u = db.prepare("SELECT balance FROM users WHERE id=?").get(req.uid);
  if (!(a >= 5) || a > u.balance || !/.+@.+\..+/.test(pp)) return res.status(400).json({ error: "Min $5, within balance, valid PayPal email" });
  txn(() => {
    db.prepare("UPDATE users SET balance=balance-? WHERE id=?").run(a, req.uid);
    db.prepare("INSERT INTO payouts(uid,amount,paypal,ts) VALUES(?,?,?,?)").run(req.uid, a, pp, Date.now());
  });
  res.json({ ok: 1 });
});

app.listen(PORT, () => console.log("Meridian on :" + PORT));