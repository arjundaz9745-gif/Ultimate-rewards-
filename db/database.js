const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'store.json');

// Default data
const defaultData = {
  users: {},
  tickets: [],
  products: [
    {
      id: 'mcfa',
      name: 'MCFA',
      description: 'Premium Minecraft Full Access. Clean accounts, fast delivery by staff.',
      price: '₹550',
      icon: '⛏️',
      stock: 'Infinite',
      active: 1
    },
    {
      id: 'robux',
      name: 'Robux',
      description: 'Official-style Robux top-up. Secure and handled personally by staff.',
      price: '$100',
      icon: '💎',
      stock: 'Infinite',
      active: 1
    },
    {
      id: 'nfa',
      name: 'NFA',
      description: 'NFA access. Requires 2 invites from our Discord community.',
      price: '2 Invites',
      icon: '🔑',
      stock: 'Infinite',
      active: 1
    },
    {
      id: 'crunchyroll',
      name: 'Crunchyroll Premium',
      description: 'Premium anime streaming access. Competitive and reliable.',
      price: 'Contact Staff',
      icon: '🍥',
      stock: 'Infinite',
      active: 1
    },
    {
      id: 'ytpremium',
      name: 'YouTube Premium',
      description: 'Ad-free YouTube experience. Monthly premium access.',
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
      return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
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

// Ensure products exist
if (!data.products || data.products.length === 0) {
  data.products = defaultData.products;
  save(data);
}

const db = {
  // Users
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

  // Products
  getProducts() {
    return data.products.filter(p => p.active);
  },
  getProduct(id) {
    return data.products.find(p => p.id === id) || null;
  },

  // Tickets
  createTicket(ticket) {
    data.tickets.unshift(ticket); // newest first
    save(data);
    return ticket;
  },
  getTicketsByUser(userId) {
    return data.tickets.filter(t => t.user_id === userId);
  },
  getTicket(id) {
    return data.tickets.find(t => t.id === id) || null;
  },
  getAllTickets(status = null) {
    if (status) return data.tickets.filter(t => t.status === status);
    return data.tickets;
  },
  updateTicket(id, updates) {
    const idx = data.tickets.findIndex(t => t.id === id);
    if (idx === -1) return null;
    data.tickets[idx] = {
      ...data.tickets[idx],
      ...updates,
      updated_at: new Date().toISOString()
    };
    save(data);
    return data.tickets[idx];
  },
  getStats() {
    const tickets = data.tickets;
    return {
      total: tickets.length,
      open: tickets.filter(t => t.status === 'open').length,
      pending: tickets.filter(t => t.status === 'pending_payment').length,
      paid: tickets.filter(t => t.status === 'paid').length,
      delivered: tickets.filter(t => t.status === 'delivered').length
    };
  }
};

module.exports = db;
