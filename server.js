
const express = require("express");
const session = require("express-session");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI;
const GUILD_ID = "1542542660458385508";
const STAFF_ROLE_ID = "1543935007339585630";

app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || "change-this-in-render",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly:true, sameSite:"lax", secure:process.env.NODE_ENV==="production", maxAge:7*24*60*60*1000 }
}));
app.use(express.static(path.join(__dirname,"public")));

app.get("/auth/discord",(req,res)=>{
  if(!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI || !process.env.SESSION_SECRET)
    return res.status(503).send("Discord login is not configured yet.");
  const q=new URLSearchParams({
    client_id:CLIENT_ID,response_type:"code",redirect_uri:REDIRECT_URI,
    scope:"identify guilds.members.read"
  });
  res.redirect("https://discord.com/oauth2/authorize?"+q.toString());
});

app.get("/auth/discord/callback",async(req,res)=>{
  try{
    if(!req.query.code) return res.status(400).send("Missing OAuth code.");
    const body=new URLSearchParams({
      client_id:CLIENT_ID,client_secret:CLIENT_SECRET,grant_type:"authorization_code",
      code:req.query.code,redirect_uri:REDIRECT_URI
    });
    const tr=await fetch("https://discord.com/api/oauth2/token",{
      method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body
    });
    if(!tr.ok) throw new Error("Token exchange failed");
    const token=await tr.json();

    const ur=await fetch("https://discord.com/api/users/@me",{
      headers:{Authorization:`Bearer ${token.access_token}`}
    });
    if(!ur.ok) throw new Error("User lookup failed");
    const user=await ur.json();

    const mr=await fetch(
      `https://discord.com/api/users/@me/guilds/${GUILD_ID}/member`,
      {headers:{Authorization:`Bearer ${token.access_token}`}}
    );
    const inServer=mr.ok;
    let isStaff=false;
    if(inServer){
      const member=await mr.json();
      isStaff=Array.isArray(member.roles) && member.roles.includes(STAFF_ROLE_ID);
    }

    req.session.user={
      id:user.id,username:user.global_name||user.username,
      avatar:user.avatar||null,inServer,isStaff
    };
    if(!inServer) return res.redirect("/?login=not_member");
    res.redirect("/?login=success");
  }catch(e){
    console.error(e);
    res.status(500).send("Discord login failed.");
  }
});

app.get("/api/me",(req,res)=>{
  if(!req.session.user) return res.json({loggedIn:false});
  res.json({loggedIn:true,user:req.session.user,isStaff:!!req.session.user.isStaff});
});
app.post("/auth/logout",(req,res)=>req.session.destroy(()=>res.json({ok:true})));

app.get("/api/staff-only",(req,res)=>{
  if(!req.session.user?.isStaff) return res.status(403).json({error:"Staff role required"});
  res.json({ok:true,user:req.session.user});
});

app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`Ultimate Rewards running on ${PORT}`));
