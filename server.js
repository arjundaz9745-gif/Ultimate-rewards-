require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('./db/database');
const { requireLogin, requireStaff } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID || '1542542660458385508';
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID || '1548173330794815599';
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const REDIRECT_URI = `${BASE_URL}/auth/callback`;

// Temporary staff list (User IDs) — works without bot
const STAFF_USER_IDS = new Set([
  '1233366635696361562',
  '1497677845781282979',
  '1397458376144715937',
  '1377328880687513661',
  '1519024580230906057',
  '1457319560146456723',
  '1545107998060449803',
  '1521960673926447257',
  '1518223147646713987',
  '1278676601139367948',
  '1213963724189077574',
  '1255848812686348309',
  '1366267227782910043',
  '1398727414829551707',
  '1528412643038204118'
]);

app.set('trust proxy', 1); // Required for Render

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || 'ultimate-rewards-dev-secret',
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    secure: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));

app.use(express.static(path.join(__dirname, 'public')));

// ========== Discord Helpers ==========

async function exchangeCode(code) {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI
  });

  const res = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${text}`);
  }
  return res.json();
}

async function fetchDiscordUser(accessToken) {
  const res = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) throw new Error('Failed to fetch user');
  return res.json();
}

async function checkStaffRole(userId) {
  // Primary: Discord role via bot
  if (BOT_TOKEN) {
    try {
      const res = await fetch(
        `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}`,
        { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
      );
      if (res.ok) {
        const member = await res.json();
        if (Array.isArray(member.roles) && member.roles.includes(STAFF_ROLE_ID)) {
          return true;
        }
      } else {
        console.error('Role check HTTP', res.status);
      }
    } catch (e) {
      console.error('Role check error:', e.message);
    }
  }
  // Fallback: hardcoded staff user IDs
  return STAFF_USER_IDS.has(String(userId));
}

// ========== Auth Routes ==========

app.get('/auth/login', (req, res) => {
  if (!CLIENT_ID) {
    return res.status(500).send('Discord Client ID not configured. Check environment variables.');
  }
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'identify'
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect('/?error=no_code');

  try {
    const tokenData = await exchangeCode(code);
    const discordUser = await fetchDiscordUser(tokenData.access_token);
    const isStaff = await checkStaffRole(discordUser.id);

    db.upsertUser({
      id: discordUser.id,
      username: discordUser.username,
      global_name: discordUser.global_name || discordUser.username,
      avatar: discordUser.avatar,
      is_staff: isStaff ? 1 : 0
    });

    req.session.user = {
      id: discordUser.id,
      username: discordUser.username,
      global_name: discordUser.global_name || discordUser.username,
      avatar: discordUser.avatar,
      is_staff: isStaff
    };

    res.redirect(isStaff ? '/staff.html' : '/#order');
  } catch (err) {
    console.error('OAuth error:', err);
    res.redirect('/?error=auth_failed');
  }
});

app.get('/auth/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

app.get('/api/me', (req, res) => {
  if (!req.session.user) return res.json({ loggedIn: false });
  res.json({ loggedIn: true, user: req.session.user });
});

// ========== Products ==========

app.get('/api/products', (req, res) => {
  res.json(db.getProducts());
});

// ========== Tickets (Members) ==========

app.post('/api/tickets', requireLogin, (req, res) => {
  const { product_id, customer_note, payment_proof } = req.body;
  if (!product_id) return res.status(400).json({ error: 'Product required' });

  const product = db.getProduct(product_id);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const id = uuidv4().slice(0, 8).toUpperCase();
  const now = new Date().toISOString();
  const messages = [];
  if (customer_note || payment_proof) {
    messages.push({
      id: uuidv4().slice(0, 8),
      from: 'customer',
      user_id: req.session.user.id,
      name: req.session.user.global_name || req.session.user.username,
      text: [customer_note, payment_proof ? ('Proof: ' + payment_proof) : null].filter(Boolean).join('\n'),
      at: now
    });
  }

  const ticket = {
    id,
    user_id: req.session.user.id,
    product_id: product.id,
    product_name: product.name,
    price: product.price,
    status: 'open',
    payment_proof: payment_proof || null,
    customer_note: customer_note || null,
    staff_note: null,
    messages,
    created_at: now,
    updated_at: now
  };

  db.createTicket(ticket);
  res.json({ success: true, ticket_id: id });
});

app.get('/api/tickets/mine', requireLogin, (req, res) => {
  res.json(db.getTicketsByUser(req.session.user.id));
});

app.get('/api/tickets/:id', requireLogin, (req, res) => {
  const ticket = db.getTicket(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  if (ticket.user_id !== req.session.user.id && !req.session.user.is_staff) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.json(ticket);
});

// ========== Staff Tickets ==========

app.get('/api/staff/tickets', requireStaff, (req, res) => {
  const status = req.query.status || null;
  const tickets = db.getAllTickets(status);

  // Attach basic user info
  const result = tickets.map(t => {
    const user = db.getUser(t.user_id) || {};
    return {
      ...t,
      username: user.username || 'Unknown',
      global_name: user.global_name || user.username || 'Unknown',
      avatar: user.avatar || null
    };
  });

  res.json(result);
});

app.patch('/api/staff/tickets/:id', requireStaff, (req, res) => {
  const { status, staff_note } = req.body;
  const allowed = ['open', 'pending_payment', 'paid', 'delivered', 'closed', 'rejected'];
  if (status && !allowed.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const updates = {};
  if (status) updates.status = status;
  if (staff_note !== undefined) updates.staff_note = staff_note;

  const updated = db.updateTicket(req.params.id, updates);
  if (!updated) return res.status(404).json({ error: 'Ticket not found' });
  res.json(updated);
});

// ========== Ticket Messages ==========

app.post('/api/tickets/:id/messages', requireLogin, (req, res) => {
  const ticket = db.getTicket(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  const isOwner = ticket.user_id === req.session.user.id;
  const isStaff = req.session.user.is_staff;
  if (!isOwner && !isStaff) return res.status(403).json({ error: 'Forbidden' });

  const text = (req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Message required' });

  const message = {
    id: uuidv4().slice(0, 8),
    from: isStaff ? 'staff' : 'customer',
    user_id: req.session.user.id,
    name: req.session.user.global_name || req.session.user.username,
    text,
    at: new Date().toISOString()
  };

  const updated = db.addMessage(req.params.id, message);
  res.json(updated);
});

// ========== Stats (Staff) ==========

app.get('/api/staff/stats', requireStaff, (req, res) => {
  res.json(db.getStats());
});

// ========== Fallback ==========

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n✦ Ultimate Rewards running at ${BASE_URL}`);
  console.log(`  Login: ${BASE_URL}/auth/login\n`);
});
