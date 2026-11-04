// Meridian: CPX Research publisher site. Run: npm i && node server.js (env vars in .env.example)
// NOTE: No email verification is used. The "email" DB column now stores the USERNAME.
const express=require("express"),{DatabaseSync}=require("node:sqlite"),bcrypt=require("bcryptjs"),crypto=require("crypto"),cp=require("cookie-parser");
const {CPX_APP_ID,CPX_SECRET,PORT=3000}=process.env,SHARE=parseFloat(process.env.USER_SHARE||"0.5");
if(!CPX_APP_ID||!CPX_SECRET){console.error("Set CPX_APP_ID and CPX_SECRET");process.exit(1)}
const db=new DatabaseSync(process.env.DB_PATH||"meridian.db");
const txn=f=>{db.exec("BEGIN");try{f();db.exec("COMMIT")}catch(e){db.exec("ROLLBACK");throw e}};
db.exec(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,email TEXT UNIQUE,pw TEXT,balance REAL DEFAULT 0,earned REAL DEFAULT 0,ip TEXT,ts INTEGER);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,uid INTEGER);
CREATE TABLE IF NOT EXISTS tx(trans_id TEXT PRIMARY KEY,uid INTEGER,gross REAL,credit REAL,status TEXT,ts INTEGER);
CREATE TABLE IF NOT EXISTS payouts(id INTEGER PRIMARY KEY,uid INTEGER,amount REAL,paypal TEXT,status TEXT DEFAULT 'pending',ts INTEGER);`);
try{db.exec("ALTER TABLE users ADD COLUMN verified INTEGER DEFAULT 0");db.exec("ALTER TABLE users ADD COLUMN vtoken TEXT");db.exec("UPDATE users SET verified=1")}catch(e){}
const md5=s=>crypto.createHash("md5").update(s).digest("hex");
const app=express();app.set("trust proxy",1);app.use(express.json(),cp(),express.static("public"));
const me=(req,res,next)=>{const s=db.prepare("SELECT uid FROM sessions WHERE token=?").get(req.cookies.t||"");
 if(!s)return res.status(401).json({error:"login"});req.uid=s.uid;next()};
const login=(res,uid)=>{const t=crypto.randomBytes(24).toString("hex");db.prepare("INSERT INTO sessions VALUES(?,?)").run(t,uid);res.cookie("t",t,{httpOnly:true,sameSite:"lax",maxAge:30*864e5})};
// SIGNUP: username + password only, no email verification
app.post("/api/signup",(req,res)=>{const {username,password}=req.body||{};
 if(!(req.body||{}).agree)return res.status(400).json({error:"You must be 18+ and accept the Terms and Privacy Policy"});
 if(!/^[a-zA-Z0-9_]{3,30}$/.test(username||""))return res.status(400).json({error:"Username must be 3-30 chars (letters, numbers, underscore)"});
 if((password||"").length<8)return res.status(400).json({error:"Password must be 8+ chars"});
 const ip=req.headers["x-forwarded-for"]||req.ip;
 if(db.prepare("SELECT COUNT(*) c FROM users WHERE ip=?").get(ip).c>=(parseInt(process.env.MAX_ACCTS_PER_IP)||10))return res.status(429).json({error:"Too many accounts from this network"});
 try{const r=db.prepare("INSERT INTO users(email,pw,ip,ts,verified) VALUES(?,?,?,?,1)").run(username.toLowerCase(),bcrypt.hashSync(password,10),ip,Date.now());login(res,r.lastInsertRowid);res.json({ok:1})}
 catch(e){res.status(400).json({error:"Username already taken"})}});
app.post("/api/login",(req,res)=>{const u=db.prepare("SELECT * FROM users WHERE email=?").get(((req.body||{}).username||"").toLowerCase());
 if(!u||!bcrypt.compareSync((req.body||{}).password||"",u.pw))return res.status(400).json({error:"Wrong username or password"});login(res,u.id);res.json({ok:1})});
app.get("/api/me",me,(req,res)=>{const u=db.prepare("SELECT id,email,balance,earned,verified FROM users WHERE id=?").get(req.uid);
 const hash=md5(u.id+"-"+CPX_SECRET);
 res.json({id:u.id,username:u.email,email:u.email,balance:u.balance,earned:u.earned,verified:u.verified,
  wall:`https://offers.cpx-research.com/index.php?app_id=${CPX_APP_ID}&ext_user_id=${u.id}&secure_hash=${hash}`,
  tx:db.prepare("SELECT gross,credit,status,ts FROM tx WHERE uid=? ORDER BY ts DESC LIMIT 20").all(u.id),
  payouts:db.prepare("SELECT amount,paypal,status,ts FROM payouts WHERE uid=? ORDER BY ts DESC").all(u.id),share:SHARE})});
// CPX postback. Set in CPX dashboard: https://YOURDOMAIN/postback?status={status}&trans_id={trans_id}&user_id={user_id}&amount_usd={amount_usd}&hash={secure_hash}
app.get("/postback",(req,res)=>{const {status,trans_id,user_id,amount_usd,hash}=req.query;
 if(!trans_id||!user_id||md5(trans_id+"-"+CPX_SECRET)!==hash)return res.status(403).send("bad hash");
 const gross=parseFloat(amount_usd)||0,u=db.prepare("SELECT id FROM users WHERE id=?").get(user_id);
 if(!u)return res.status(404).send("no user");
 const old=db.prepare("SELECT * FROM tx WHERE trans_id=?").get(trans_id);
 txn(()=>{
  if(String(status)==="2"){ if(old&&old.status==="completed"){db.prepare("UPDATE users SET balance=balance-?,earned=earned-? WHERE id=?").run(old.credit,old.credit,u.id);db.prepare("UPDATE tx SET status='reversed' WHERE trans_id=?").run(trans_id)}}
  else if(!old){const credit=Math.round(gross*SHARE*100)/100;db.prepare("INSERT INTO tx VALUES(?,?,?,?,?,?)").run(trans_id,u.id,gross,credit,"completed",Date.now());
   db.prepare("UPDATE users SET balance=balance+?,earned=earned+? WHERE id=?").run(credit,credit,u.id)}});
 res.send("OK")});
app.post("/api/withdraw",me,(req,res)=>{const a=parseFloat(req.body.amount),pp=req.body.paypal||"",u=db.prepare("SELECT balance,verified FROM users WHERE id=?").get(req.uid);
 if(!(a>=5)||a>u.balance||!/.+@.+\..+/.test(pp))return res.status(400).json({error:"Min $5, within balance, valid PayPal email"});
 txn(()=>{db.prepare("UPDATE users SET balance=balance-? WHERE id=?").run(a,req.uid);db.prepare("INSERT INTO payouts(uid,amount,paypal,ts) VALUES(?,?,?,?)").run(req.uid,a,pp,Date.now())});res.json({ok:1})});
app.listen(PORT,()=>console.log("Meridian on :"+PORT));