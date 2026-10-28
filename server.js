// Meridian: CPX Research publisher site. Run: npm i && node server.js (env vars in .env.example)
const express=require("express"),{DatabaseSync}=require("node:sqlite"),bcrypt=require("bcryptjs"),crypto=require("crypto"),cp=require("cookie-parser");
const {CPX_APP_ID,CPX_SECRET,PORT=3000}=process.env,SHARE=parseFloat(process.env.USER_SHARE||"0.5");
const MAIL_KEY=process.env.RESEND_API_KEY,MAIL_FROM=process.env.MAIL_FROM||"Meridian <onboarding@resend.dev>";
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
const resent={};
const sendVerify=(req,to,vt)=>{if(!MAIL_KEY)return;const link=(process.env.BASE_URL||req.protocol+"://"+req.get("host"))+"/verify?token="+vt;
 fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+MAIL_KEY,"Content-Type":"application/json"},
 body:JSON.stringify({from:MAIL_FROM,to:[to],subject:"Confirm your email",html:`<p>Welcome to Meridian Insights.</p><p><a href="${link}">Confirm my email</a></p>`})})
 .then(r=>{if(!r.ok)r.text().then(t=>console.error("mail fail",t))}).catch(e=>console.error("mail error",e.message))};
app.get("/verify",(req,res)=>{const u=db.prepare("SELECT id FROM users WHERE vtoken=?").get(String(req.query.token||"x"));
 if(!u)return res.status(400).send("Invalid or expired link");db.prepare("UPDATE users SET verified=1,vtoken=NULL WHERE id=?").run(u.id);res.redirect("/")});
app.post("/api/resend",me,(req,res)=>{const u=db.prepare("SELECT email,verified,vtoken FROM users WHERE id=?").get(req.uid);
 if(u.verified)return res.json({ok:1});if(Date.now()-(resent[req.uid]||0)<60000)return res.status(429).json({error:"Wait a minute before resending"});
 resent[req.uid]=Date.now();sendVerify(req,u.email,u.vtoken);res.json({ok:1})});
app.post("/api/signup",(req,res)=>{const {email,password}=req.body||{};
 if(!/.+@.+\..+/.test(email||"")||(password||"").length<8)return res.status(400).json({error:"Valid email and 8+ char password required"});
 const ip=req.headers["x-forwarded-for"]||req.ip;
 if(db.prepare("SELECT COUNT(*) c FROM users WHERE ip=?").get(ip).c>=2)return res.status(429).json({error:"Too many accounts from this network"});
 try{const vt=crypto.randomBytes(20).toString("hex"),auto=MAIL_KEY?0:1;const r=db.prepare("INSERT INTO users(email,pw,ip,ts,verified,vtoken) VALUES(?,?,?,?,?,?)").run(email.toLowerCase(),bcrypt.hashSync(password,10),ip,Date.now(),auto,vt);login(res,r.lastInsertRowid);if(!auto)sendVerify(req,email.toLowerCase(),vt);res.json({ok:1})}
 catch(e){res.status(400).json({error:"Email already registered"})}});
app.post("/api/login",(req,res)=>{const u=db.prepare("SELECT * FROM users WHERE email=?").get(((req.body||{}).email||"").toLowerCase());
 if(!u||!bcrypt.compareSync((req.body||{}).password||"",u.pw))return res.status(400).json({error:"Wrong email or password"});login(res,u.id);res.json({ok:1})});
app.get("/api/me",me,(req,res)=>{const u=db.prepare("SELECT id,email,balance,earned,verified FROM users WHERE id=?").get(req.uid);
 // ASSUMPTION: verify exact wall URL and hash formula in your CPX dashboard docs
 const hash=md5(u.id+"-"+CPX_SECRET);
 res.json({...u,wall:!u.verified?null:`https://offers.cpx-research.com/index.php?app_id=${CPX_APP_ID}&ext_user_id=${u.id}&secure_hash=${hash}&email=${encodeURIComponent(u.email)}`,
  tx:db.prepare("SELECT gross,credit,status,ts FROM tx WHERE uid=? ORDER BY ts DESC LIMIT 20").all(u.id),
  payouts:db.prepare("SELECT amount,paypal,status,ts FROM payouts WHERE uid=? ORDER BY ts DESC").all(u.id),share:SHARE})});
// CPX postback. Set in CPX dashboard: https://YOURDOMAIN/postback?status={status}&trans_id={trans_id}&user_id={user_id}&amount_usd={amount_usd}&hash={secure_hash}
// ASSUMPTIONS: status 1=completed, 2=reversed; hash=md5(trans_id+"-"+secret). Check these against CPX docs.
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
 if(!u.verified||!(a>=5)||a>u.balance||!/.+@.+\..+/.test(pp))return res.status(400).json({error:"Min $5, within balance, valid PayPal email"});
 txn(()=>{db.prepare("UPDATE users SET balance=balance-? WHERE id=?").run(a,req.uid);db.prepare("INSERT INTO payouts(uid,amount,paypal,ts) VALUES(?,?,?,?)").run(req.uid,a,pp,Date.now())});res.json({ok:1})});
app.listen(PORT,()=>console.log("Meridian on :"+PORT));
