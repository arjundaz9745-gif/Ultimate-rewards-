require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const db = require('./db/database');
const { requireLogin, requireStaff: requireStaffBase } = require('./middleware/auth');

const uploadDir = process.env.RENDER ? '/tmp/uploads' : path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.png';
    cb(null, `${Date.now()}-${uuidv4().slice(0, 8)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(png|jpe?g|webp|gif)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only images allowed'));
  }
});

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
  '1457319560146456723',
  '1398979148063571989',
  '1519867569169760350',
  '1518223147646713987',
  '1381288674268020839'
]);

function requireStaff(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Login required' });
  }
  if (STAFF_USER_IDS.has(String(req.session.user.id))) {
    req.session.user.is_staff = true;
    return next();
  }
  return requireStaffBase(req, res, next);
}

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
app.use('/uploads', express.static(uploadDir));

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

function isStaffUserId(userId) {
  return STAFF_USER_IDS.has(String(userId));
}

async function checkStaffRole(userId) {
  // 1) Hardcoded staff list ALWAYS wins
  if (isStaffUserId(userId)) return true;

  // 2) Optional: Discord role via bot
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
      }
    } catch (e) {
      console.error('Role check error:', e.message);
    }
  }
  return false;
}


async function postDiscord(content, embed) {
  const channelId = process.env.DISCORD_TICKET_CHANNEL_ID;
  if (!BOT_TOKEN || !channelId) return;
  try {
    const body = {};
    if (content) body.content = content.slice(0, 1900);
    if (embed) body.embeds = [embed];
    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
  } catch (e) {
    console.error('Discord post error:', e.message);
  }
}

async function notifyStaffChannel(ticket, user) {
  const name = (user && (user.global_name || user.username)) || ticket.user_id;
  await postDiscord(null, {
    title: `New ticket #${ticket.id}`,
    color: 0xe8c84a,
    fields: [
      { name: 'Product', value: String(ticket.product_name || '-'), inline: true },
      { name: 'Price', value: String(ticket.price || '-'), inline: true },
      { name: 'Customer', value: String(name), inline: true },
      { name: 'Proof', value: String(ticket.payment_proof || 'none') },
      { name: 'Note', value: String(ticket.customer_note || 'none') }
    ],
    footer: { text: 'Ultimate Reward • Staff Panel' }
  });
}

async function notifyTicketMessage(ticketId, message) {
  const ticket = db.getTicket(ticketId);
  const who = message.from === 'staff' ? `Staff (${message.name || 'staff'})` : `Customer (${message.name || 'customer'})`;
  let ping = '';
  if (message.from === 'staff' && ticket && ticket.user_id) {
    ping = `<@${ticket.user_id}> `;
  } else if (message.from === 'customer' && STAFF_ROLE_ID) {
    ping = `<@&${STAFF_ROLE_ID}> `;
  }
  const img = message.image ? `\nProof image: ${BASE_URL}${message.image}` : '';
  await postDiscord(`${ping}**Ticket #${ticketId}** — **${who}:** ${message.text || ''}${img}`);
}

async function notifyTicketClosed(ticketId, byName) {
  await postDiscord(`✅ **Ticket #${ticketId}** closed by **${byName || 'staff'}** (still visible in Staff Panel history).`);
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

    res.redirect(isStaff ? '/staff.html' : '/my-tickets.html');
  } catch (err) {
    console.error('OAuth error:', err);
    res.redirect('/?error=auth_failed');
  }
});

app.get('/auth/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

app.get('/api/me', async (req, res) => {
  if (!req.session.user) return res.json({ loggedIn: false });

  // Refresh staff flag every request (fixes old sessions)
  const staff = await checkStaffRole(req.session.user.id);
  req.session.user.is_staff = staff;

  res.json({
    loggedIn: true,
    user: req.session.user
  });
});

// ========== Products ==========

app.get('/api/products', (req, res) => {
  res.json(db.getProducts());
});

// ========== Tickets (Members) ==========

app.post('/api/tickets', requireLogin, (req, res, next) => {
  upload.single('proof_image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
    next();
  });
}, (req, res) => {
  const { product_id, customer_note, payment_proof } = req.body;
  if (!product_id) return res.status(400).json({ error: 'Product required' });

  const product = db.getProduct(product_id);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const id = uuidv4().slice(0, 8).toUpperCase();
  const now = new Date().toISOString();
  const proofImage = req.file ? `/uploads/${req.file.filename}` : null;
  const messages = [];
  if (customer_note || payment_proof || proofImage) {
    messages.push({
      id: uuidv4().slice(0, 8),
      from: 'customer',
      user_id: req.session.user.id,
      name: req.session.user.global_name || req.session.user.username,
      text: [customer_note, payment_proof ? ('Proof: ' + payment_proof) : null].filter(Boolean).join('\n') || 'Payment proof attached',
      image: proofImage,
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
    proof_image: proofImage,
    customer_note: customer_note || null,
    staff_note: null,
    messages,
    created_at: now,
    updated_at: now
  };

  db.createTicket(ticket);
  notifyStaffChannel(ticket, req.session.user).catch(() => {});
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


// Soft close = keep on website forever for owners/staff history
app.post('/api/staff/tickets/:id/close', requireStaff, (req, res) => {
  const updated = db.updateTicket(req.params.id, { status: 'closed' });
  if (!updated) return res.status(404).json({ error: 'Ticket not found' });
  const by = req.session.user.global_name || req.session.user.username;
  notifyTicketClosed(req.params.id, by).catch(() => {});
  res.json(updated);
});

// Hard delete only if explicitly requested
app.delete('/api/staff/tickets/:id', requireStaff, (req, res) => {
  if (req.query.forever !== '1') {
    return res.status(400).json({ error: 'Use close to keep history, or forever=1 to wipe' });
  }
  const ok = db.deleteTicket(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Ticket not found' });
  res.json({ success: true });
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
  notifyTicketMessage(req.params.id, message).catch(() => {});
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


// ========== Discord bot: /close ==========
async function startDiscordBot() {
  if (!BOT_TOKEN) {
    console.log('No DISCORD_BOT_TOKEN — slash /close disabled');
    return;
  }
  try {
    const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });

    const commands = [
      new SlashCommandBuilder()
        .setName('close')
        .setDescription('Close a website ticket (keeps history on site)')
        .addStringOption(o => o.setName('id').setDescription('Ticket ID e.g. 4D5F7973').setRequired(true))
    ].map(c => c.toJSON());

    client.once('ready', async () => {
      console.log(`Discord bot ready as ${client.user.tag}`);
      try {
        const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
        if (GUILD_ID) {
          await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), { body: commands });
          console.log('Registered /close in guild');
        }
      } catch (e) {
        console.error('Slash register error:', e.message);
      }
    });

    client.on('interactionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand()) return;
      if (interaction.commandName !== 'close') return;

      const uid = interaction.user.id;
      const isStaff = STAFF_USER_IDS.has(String(uid)) ||
        (interaction.member && interaction.member.roles && interaction.member.roles.cache && interaction.member.roles.cache.has(STAFF_ROLE_ID));

      if (!isStaff) {
        return interaction.reply({ content: 'Staff only.', ephemeral: true });
      }

      const id = (interaction.options.getString('id') || '').toUpperCase().replace('#', '');
      const ticket = db.getTicket(id);
      if (!ticket) {
        return interaction.reply({ content: `Ticket #${id} not found.`, ephemeral: true });
      }

      db.updateTicket(id, { status: 'closed' });
      notifyTicketClosed(id, interaction.user.username).catch(() => {});
      await interaction.reply({ content: `Ticket **#${id}** closed. Still visible on the website for staff/owners.` });
    });

    await client.login(BOT_TOKEN);
  } catch (e) {
    console.error('Discord bot failed to start:', e.message);
  }
}

startDiscordBot();

app.listen(PORT, () => {
  console.log(`\n✦ Ultimate Rewards running at ${BASE_URL}`);
  console.log(`  Login: ${BASE_URL}/auth/login\n`);
});
