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
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID || '1543935007339585630';
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const REDIRECT_URI = `${BASE_URL}/auth/callback`;

// Temporary staff list (User IDs) — works without bot
// Later when you have admin + bot, we can switch back to role check
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


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || 'ultimate-rewards-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: BASE_URL.startsWith('https'),
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
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
  // 1. First check the hard-coded staff User ID list (works without bot)
  if (STAFF_USER_IDS.has(String(userId))) {
    return true;
  }

  // 2. If bot token exists, also try role check (for future)
  if (!BOT_TOKEN) return false;
  try {
    const res = await fetch(
      `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}`,
      { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
    );
    if (!res.ok) return false;
    const member = await res.json();
    return Array.isArray(member.roles) && member.roles.includes(STAFF_ROLE_ID);
  } catch (e) {
    console.error('Role check error:', e.message);
    return false;
  }
}

// ========== Auth Routes ==========

app.get('/auth/login', (req, res) => {
  if (!CLIENT_ID) {
    return res.status(500).send('Discord Client ID not configured. Check .env');
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

    // Upsert user
    const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(discordUser.id);
    if (existing) {
      db.prepare(`
        UPDATE users SET username = ?, global_name = ?, avatar = ?, is_staff = ?, last_login = datetime('now')
        WHERE id = ?
      `).run(
        discordUser.username,
        discordUser.global_name || discordUser.username,
        discordUser.avatar,
        isStaff ? 1 : 0,
        discordUser.id
      );
    } else {
      db.prepare(`
        INSERT INTO users (id, username, global_name, avatar, is_staff)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        discordUser.id,
        discordUser.username,
        discordUser.global_name || discordUser.username,
        discordUser.avatar,
        isStaff ? 1 : 0
      );
    }

    req.session.user = {
      id: discordUser.id,
      username: discordUser.username,
      global_name: discordUser.global_name || discordUser.username,
      avatar: discordUser.avatar,
      is_staff: isStaff
    };

    res.redirect(isStaff ? '/staff.html' : '/dashboard.html');
  } catch (err) {
    console.error('OAuth error:', err);
    res.redirect('/?error=auth_failed');
  }
});

app.get('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

app.get('/api/me', (req, res) => {
  if (!req.session.user) return res.json({ loggedIn: false });
  res.json({ loggedIn: true, user: req.session.user });
});

// ========== Products ==========

app.get('/api/products', (req, res) => {
  const products = db.prepare('SELECT * FROM products WHERE active = 1').all();
  res.json(products);
});

// ========== Tickets (Members) ==========

app.post('/api/tickets', requireLogin, (req, res) => {
  const { product_id, customer_note, payment_proof } = req.body;
  if (!product_id) return res.status(400).json({ error: 'Product required' });

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(product_id);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const id = uuidv4().slice(0, 8).toUpperCase();

  db.prepare(`
    INSERT INTO tickets (id, user_id, product_id, product_name, price, customer_note, payment_proof, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'open')
  `).run(
    id,
    req.session.user.id,
    product.id,
    product.name,
    product.price,
    customer_note || null,
    payment_proof || null
  );

  res.json({ success: true, ticket_id: id });
});

app.get('/api/tickets/mine', requireLogin, (req, res) => {
  const tickets = db.prepare(`
    SELECT * FROM tickets WHERE user_id = ? ORDER BY created_at DESC
  `).all(req.session.user.id);
  res.json(tickets);
});

app.get('/api/tickets/:id', requireLogin, (req, res) => {
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  // Members can only see their own, staff can see all
  if (ticket.user_id !== req.session.user.id && !req.session.user.is_staff) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.json(ticket);
});

// ========== Staff Tickets ==========

app.get('/api/staff/tickets', requireStaff, (req, res) => {
  const status = req.query.status; // optional filter
  let tickets;
  if (status) {
    tickets = db.prepare(`
      SELECT t.*, u.username, u.global_name, u.avatar
      FROM tickets t
      JOIN users u ON t.user_id = u.id
      WHERE t.status = ?
      ORDER BY t.created_at DESC
    `).all(status);
  } else {
    tickets = db.prepare(`
      SELECT t.*, u.username, u.global_name, u.avatar
      FROM tickets t
      JOIN users u ON t.user_id = u.id
      ORDER BY t.created_at DESC
    `).all();
  }
  res.json(tickets);
});

app.patch('/api/staff/tickets/:id', requireStaff, (req, res) => {
  const { status, staff_note } = req.body;
  const allowed = ['open', 'pending_payment', 'paid', 'delivered', 'closed', 'rejected'];
  if (status && !allowed.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  db.prepare(`
    UPDATE tickets
    SET status = COALESCE(?, status),
        staff_note = COALESCE(?, staff_note),
        updated_at = datetime('now')
    WHERE id = ?
  `).run(status || null, staff_note || null, req.params.id);

  const updated = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// ========== Stats (Staff) ==========

app.get('/api/staff/stats', requireStaff, (req, res) => {
  const stats = {
    total: db.prepare('SELECT COUNT(*) as c FROM tickets').get().c,
    open: db.prepare("SELECT COUNT(*) as c FROM tickets WHERE status = 'open'").get().c,
    pending: db.prepare("SELECT COUNT(*) as c FROM tickets WHERE status = 'pending_payment'").get().c,
    paid: db.prepare("SELECT COUNT(*) as c FROM tickets WHERE status = 'paid'").get().c,
    delivered: db.prepare("SELECT COUNT(*) as c FROM tickets WHERE status = 'delivered'").get().c
  };
  res.json(stats);
});

// ========== Fallback ==========

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n✦ Ultimate Rewards running at ${BASE_URL}`);
  console.log(`  Login: ${BASE_URL}/auth/login`);
  console.log(`  Staff role: ${STAFF_ROLE_ID}`);
  console.log(`  Guild: ${GUILD_ID}\n`);
});
