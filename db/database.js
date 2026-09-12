const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'store.json');

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

if (!data.products || data.products.length === 0) {
  data.products = defaultData.products;
  save(data);
}

// Migrate old tickets that don't have messages array
data.tickets.forEach(t => {
  if (!Array.isArray(t.messages)) {
    t.messages = [];
    if (t.customer_note) {
      t.messages.push({
        id: 'm1',
        from: 'customer',
        user_id: t.user_id,
        text: t.customer_note,
        at: t.created_at
      });
    }
    if (t.staff_note) {
      t.messages.push({
        id: 'm2',
        from: 'staff',
        user_id: 'staff',
        text: t.staff_note,
        at: t.updated_at || t.created_at
      });
    }
  }
});
save(data);

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
    return data.products.filter(p => p.active);
  },
  getProduct(id) {
    return data.products.find(p => p.id === id) || null;
  },
  createTicket(ticket) {
    if (!ticket.messages) ticket.messages = [];
    data.tickets.unshift(ticket);
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
  addMessage(ticketId, message) {
    const idx = data.tickets.findIndex(t => t.id === ticketId);
    if (idx === -1) return null;
    if (!data.tickets[idx].messages) data.tickets[idx].messages = [];
    data.tickets[idx].messages.push(message);
    data.tickets[idx].updated_at = new Date().toISOString();
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
