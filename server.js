const express = require("express");
const session = require("express-session");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Discord settings
const GUILD_ID = "1542542660458385508";
const STAFF_ROLE_ID = "1543935007339585630";

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI;

app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET || "change-this-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  })
);

// Serve website
app.use(express.static(path.join(__dirname, "public")));

// Discord login
app.get("/auth/discord", (req, res) => {
  if (!DISCORD_CLIENT_ID || !DISCORD_REDIRECT_URI) {
    return res.status(500).send("Discord OAuth is not configured.");
  }

  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: "code",
    scope: "identify guilds.members.read"
  });

  res.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
});

// Discord callback
app.get("/auth/discord/callback", async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send("Missing Discord authorization code.");
  }

  try {
    const tokenResponse = await fetch(
      "https://discord.com/api/oauth2/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          client_id: DISCORD_CLIENT_ID,
          client_secret: DISCORD_CLIENT_SECRET,
          grant_type: "authorization_code",
          code,
          redirect_uri: DISCORD_REDIRECT_URI
        })
      }
    );

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error("Discord token error:", tokenData);
      return res.status(400).send("Discord login failed.");
    }

    // Get Discord user
    const userResponse = await fetch(
      "https://discord.com/api/users/@me",
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`
        }
      }
    );

    const user = await userResponse.json();

    if (!userResponse.ok) {
      return res.status(400).send("Couldn't get Discord account.");
    }

    // Check server membership + staff role
    const memberResponse = await fetch(
      `https://discord.com/api/users/@me/guilds/${GUILD_ID}/member`,
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`
        }
      }
    );

    let member = null;

    if (memberResponse.ok) {
      member = await memberResponse.json();
    }

    const isStaff =
      member &&
      Array.isArray(member.roles) &&
      member.roles.includes(STAFF_ROLE_ID);

    req.session.user = {
      id: user.id,
      username: user.username,
      global_name: user.global_name || user.username,
      avatar: user.avatar || null,
      isMember: !!member,
      isStaff
    };

    res.redirect("/?login=success");
  } catch (error) {
    console.error("Discord OAuth error:", error);
    res.status(500).send("Login error.");
  }
});

// Current logged-in user
app.get("/api/me", (req, res) => {
  res.json({
    loggedIn: !!req.session.user,
    user: req.session.user || null
  });
});

// Staff-only test endpoint
app.get("/api/staff-only", (req, res) => {
  if (!req.session.user || !req.session.user.isStaff) {
    return res.status(403).json({
      error: "Staff access required."
    });
  }

  res.json({
    success: true,
    message: "Welcome, staff member!"
  });
});

// Logout
app.get("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

// IMPORTANT:
// Express 5 does not support app.get("*").
// This middleware handles all remaining routes.
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start server
app.listen(PORT, () => {
  console.log(`Ultimate Rewards running on port ${PORT}`);
});
