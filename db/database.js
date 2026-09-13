const fs = require('fs');
const path = require('path');

// On Render free tier, local files are wiped on restart.
// Prefer /tmp while the instance is alive; optional Mongo later via env.
const DB_PATH = process.env.RENDER
  ? path.join('/tmp', 'ultimate-rewards-store.json')
  : path.join(__dirname, 'store.json');

const defaultData = {
  users: {},
  tickets: [],
  products: [
    {
      id: 'mcfa',
      name: 'MCFA',
      description: 'Minecraft Full Access. Delivered by staff.',
      price: '₹550',
      icon: '⛏️',
      stock: 'Infinite',
      active: 1
    },
    {
      id: 'robux',
      name: 'Robux',
      description: 'Roblox Robux top-up via staff.',
      price: '$100',
      icon: '💎',
      stock: 'Infinite',
      active: 1
    },
    {
      id: 'nfa',
      name: 'NFA',
      description: 'Non-Full Access. 2 invites required.',
      price: '2 Invites',
      icon: '🔑',
      stock: 'Infinite',
      active: 1
    },
    {
      id: 'crunchyroll',
      name: 'Crunchyroll Premium',
      description: 'Premium anime streaming access.',
      price: 'Contact Staff',
      icon: '🍥',
      stock: 'Infinite',
      active: 1
    },
    {
      id: 'ytpremium',
      name: 'YouTube Premium',
      description: 'Ad-free YouTube. ₹100 / month.',
      price: '₹100 / mo',
      icon: '▶️',
      stock: 'Infinite',
      active: 1
    }
  ]
};

function load() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        if (!Array.isArray(parsed.tickets)) parsed.tickets = [];
        if (!parsed.users) parsed.users = {};
        if (!parsed.products || !parsed.products.length) parsed.products = defaultData.products;
        return parsed;
      }
    }
  } catch (e) {
    console.error('DB load error:', e.message);
  }
  return structuredClone(defaultData);
}

function save(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('DB save error:', e.message);
  }
}

let data = load();
console.log(`[db] loaded ${data.tickets.length} tickets from ${DB_PATH}`);

data.tickets.forEach((t) => {
  if (!Array.isArray(t.messages)) t.messages = [];
});

const db = {
  getUser(id) {
    return data.users[id] || null;
  },
  upsertUser(user) {
    data.users[user.id] = {
      ...data.users[user.id],
      ...user,
      last_login: new Date().toISOString()
    };
    if (!data.users[user.id].created_at) {
      data.users[user.id].created_at = new Date().toISOString();
    }
    save(data);
    return data.users[user.id];
  },
  getProducts() {
    return data.products.filter((p) => p.active);
  },
  getProduct(id) {
    return data.products.find((p) => p.id === id) || null;
  },
  createTicket(ticket) {
    if (!ticket.messages) ticket.messages = [];
    data.tickets.unshift(ticket);
    save(data);
    console.log(`[db] ticket created #${ticket.id} total=${data.tickets.length}`);
    return ticket;
  },
  getTicketsByUser(userId) {
    return data.tickets.filter((t) => t.user_id === String(userId));
  },
  getTicket(id) {
    return data.tickets.find((t) => t.id === id) || null;
  },
  getAllTickets(status = null) {
    // ALL tickets for staff — never filter by staff user
    if (status) return data.tickets.filter((t) => t.status === status);
    return [...data.tickets];
  },
  updateTicket(id, updates) {
    const idx = data.tickets.findIndex((t) => t.id === id);
    if (idx === -1) return null;
    data.tickets[idx] = {
      ...data.tickets[idx],
      ...updates,
      updated_at: new Date().toISOString()
    };
    save(data);
    return data.tickets[idx];
  },
  addMessage(ticketId, message) {
    const idx = data.tickets.findIndex((t) => t.id === ticketId);
    if (idx === -1) return null;
    if (!data.tickets[idx].messages) data.tickets[idx].messages = [];
    data.tickets[idx].messages.push(message);
    data.tickets[idx].updated_at = new Date().toISOString();
    save(data);
    return data.tickets[idx];
  },
  deleteTicket(id) {
    const before = data.tickets.length;
    data.tickets = data.tickets.filter((t) => t.id !== id);
    save(data);
    return data.tickets.length < before;
  },
  getStats() {
    const tickets = data.tickets;
    return {
      total: tickets.length,
      open: tickets.filter((t) => t.status === 'open').length,
      pending: tickets.filter((t) => t.status === 'pending_payment').length,
      paid: tickets.filter((t) => t.status === 'paid').length,
      delivered: tickets.filter((t) => t.status === 'delivered').length
    };
  }
};

module.exports = db;
