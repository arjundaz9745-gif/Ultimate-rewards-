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
    // ── Minecraft singles ──
    { id: 'nfa', name: 'Minecraft NFA', description: 'Non-Full Access Minecraft account.', price: '₹49', icon: '🎮', stock: 'Infinite', active: 1, tags: 'minecraft,new', category: 'minecraft' },
    { id: 'mcfa', name: 'Minecraft MCFA', description: 'Minecraft Full Access. Delivered by staff.', price: '₹149', icon: '🎮', stock: 'Infinite', active: 1, tags: 'minecraft,new', category: 'minecraft' },
    { id: 'mc-premium', name: 'Minecraft Premium', description: 'Premium Minecraft access.', price: '₹299', icon: '🎮', stock: 'Infinite', active: 1, tags: 'minecraft,premium', category: 'minecraft' },

    // ── Minecraft bundles ──
    { id: 'nfa-x3', name: 'NFA × 3 Bundle', description: '3× Minecraft NFA accounts.', price: '₹119', icon: '🎁', stock: 'Infinite', active: 1, tags: 'minecraft,bundle', category: 'minecraft' },
    { id: 'mcfa-x3', name: 'MCFA × 3 Bundle', description: '3× Minecraft MCFA accounts.', price: '₹399', icon: '🎁', stock: 'Infinite', active: 1, tags: 'minecraft,bundle', category: 'minecraft' },
    { id: 'mcfa-premium', name: 'MCFA + Premium Bundle', description: 'MCFA + Minecraft Premium together.', price: '₹399', icon: '💎', stock: 'Infinite', active: 1, tags: 'minecraft,bundle,premium', category: 'minecraft' },
    { id: 'ultimate-mc', name: 'Ultimate Minecraft Bundle', description: 'MCFA × 3 (₹447) + NFA × 3 (₹147) = ₹594 → Bundle ₹499. You save ₹95!', price: '₹499', icon: '🔥', stock: 'Infinite', active: 1, tags: 'minecraft,bundle,flash,featured', category: 'minecraft' },

    // ── Entertainment singles ──
    { id: 'ent-1m', name: '1-Month Entertainment Voucher', description: '1 month entertainment access.', price: '₹99', icon: '🎬', stock: 'Infinite', active: 1, tags: 'entertainment,new', category: 'entertainment' },
    { id: 'ent-3m', name: '3-Month Entertainment Bundle', description: '3 months entertainment access.', price: '₹249', icon: '🎬', stock: 'Infinite', active: 1, tags: 'entertainment,bundle', category: 'entertainment' },
    { id: 'ent-x3', name: 'Entertainment × 3 Bundle', description: '3× entertainment vouchers.', price: '₹199', icon: '🎁', stock: 'Infinite', active: 1, tags: 'entertainment,bundle', category: 'entertainment' },

    // ── Netflix ──
    { id: 'netflix-1m', name: 'Netflix — 1 Month', description: 'Netflix Premium 1 month.', price: '₹199', icon: '🎬', stock: 'Infinite', active: 1, tags: 'entertainment,netflix', category: 'entertainment' },
    { id: 'netflix-3m', name: 'Netflix — 3 Months', description: 'Netflix Premium 3 months.', price: '₹549', icon: '🎬', stock: 'Infinite', active: 1, tags: 'entertainment,netflix', category: 'entertainment' },
    { id: 'netflix-6m', name: 'Netflix — 6 Months', description: 'Netflix Premium 6 months.', price: '₹999', icon: '🎬', stock: 'Infinite', active: 1, tags: 'entertainment,netflix,premium', category: 'entertainment' },
    { id: 'netflix-12m', name: 'Netflix — 12 Months', description: 'Netflix Premium 12 months.', price: '₹1,799', icon: '🎬', stock: 'Infinite', active: 1, tags: 'entertainment,netflix,premium', category: 'entertainment' },

    // ── YouTube / Spotify ──
    { id: 'yt-1m', name: 'YouTube Premium — 1 Month', description: 'YouTube Premium 1 month.', price: '₹99', icon: '▶️', stock: 'Infinite', active: 1, tags: 'entertainment,youtube', category: 'entertainment' },
    { id: 'yt-3m', name: 'YouTube Premium — 3 Months', description: 'YouTube Premium 3 months.', price: '₹249', icon: '▶️', stock: 'Infinite', active: 1, tags: 'entertainment,youtube', category: 'entertainment' },
    { id: 'spotify-1m', name: 'Spotify Premium — 1 Month', description: 'Spotify Premium 1 month.', price: '₹99', icon: '🎵', stock: 'Infinite', active: 1, tags: 'entertainment,spotify', category: 'entertainment' },
    { id: 'spotify-3m', name: 'Spotify Premium — 3 Months', description: 'Spotify Premium 3 months.', price: '₹249', icon: '🎵', stock: 'Infinite', active: 1, tags: 'entertainment,spotify', category: 'entertainment' },
    { id: 'spotify-6m', name: 'Spotify Premium — 6 Months', description: 'Spotify Premium 6 months.', price: '₹449', icon: '🎵', stock: 'Infinite', active: 1, tags: 'entertainment,spotify', category: 'entertainment' },

    // ── Gift vouchers ──
    { id: 'gift-100', name: '₹100 Gift Voucher', description: '₹100 store gift voucher.', price: '₹95', icon: '💳', stock: 'Infinite', active: 1, tags: 'giftcard', category: 'giftcard' },
    { id: 'gift-250', name: '₹250 Gift Voucher', description: '₹250 store gift voucher.', price: '₹235', icon: '💳', stock: 'Infinite', active: 1, tags: 'giftcard', category: 'giftcard' },
    { id: 'gift-500', name: '₹500 Gift Voucher', description: '₹500 store gift voucher.', price: '₹469', icon: '💳', stock: 'Infinite', active: 1, tags: 'giftcard', category: 'giftcard' },
    { id: 'gift-1000', name: '₹1,000 Gift Voucher', description: '₹1,000 store gift voucher.', price: '₹929', icon: '🏷️', stock: 'Infinite', active: 1, tags: 'giftcard,premium', category: 'giftcard' },

    // ── Gaming vouchers ──
    { id: 'gp-100', name: 'Google Play Voucher ₹100', description: 'Google Play ₹100 voucher.', price: '₹95', icon: '🎮', stock: 'Infinite', active: 1, tags: 'giftcard,gaming', category: 'giftcard' },
    { id: 'gp-500', name: 'Google Play Voucher ₹500', description: 'Google Play ₹500 voucher.', price: '₹469', icon: '🎮', stock: 'Infinite', active: 1, tags: 'giftcard,gaming', category: 'giftcard' },
    { id: 'apple-100', name: 'Apple Gift Card ₹100', description: 'Apple Gift Card ₹100.', price: '₹95', icon: '🍎', stock: 'Infinite', active: 1, tags: 'giftcard', category: 'giftcard' },
    { id: 'apple-500', name: 'Apple Gift Card ₹500', description: 'Apple Gift Card ₹500.', price: '₹469', icon: '🍎', stock: 'Infinite', active: 1, tags: 'giftcard', category: 'giftcard' },
    { id: 'ps-500', name: 'PlayStation Voucher ₹500', description: 'PlayStation Store ₹500.', price: '₹479', icon: '🎮', stock: 'Infinite', active: 1, tags: 'giftcard,gaming', category: 'giftcard' },
    { id: 'xbox-500', name: 'Xbox Gift Card ₹500', description: 'Xbox Gift Card ₹500.', price: '₹479', icon: '🎮', stock: 'Infinite', active: 1, tags: 'giftcard,gaming', category: 'giftcard' },
    { id: 'steam-500', name: 'Steam Wallet ₹500', description: 'Steam Wallet ₹500.', price: '₹479', icon: '🎮', stock: 'Infinite', active: 1, tags: 'giftcard,gaming', category: 'giftcard' },

    // ── Mystery / Flash / Premium boxes ──
    { id: 'mystery', name: 'Mystery Reward', description: 'Random surprise reward.', price: '₹49', icon: '⚡', stock: 'Infinite', active: 1, tags: 'flash,new', category: 'premium' },
    { id: 'mystery-x3', name: 'Mystery Bundle × 3', description: '3× Mystery Rewards.', price: '₹119', icon: '🎁', stock: 'Infinite', active: 1, tags: 'bundle,flash', category: 'premium' },
    { id: 'flash-box', name: 'Flash Deal Box', description: 'Limited-time flash deal box.', price: '₹199', icon: '🔥', stock: 'Infinite', active: 1, tags: 'flash,featured', category: 'premium' },
    { id: 'premium-box', name: 'Premium Reward Box', description: 'High-value premium reward box.', price: '₹399', icon: '💎', stock: 'Infinite', active: 1, tags: 'premium,featured', category: 'premium' },
    { id: 'vip-bundle', name: 'VIP Bundle', description: 'VIP exclusive bundle.', price: '₹599', icon: '👑', stock: 'Infinite', active: 1, tags: 'premium,vip,bundle', category: 'premium' },
    { id: 'mega-bundle', name: 'Ultimate Mega Bundle', description: 'Biggest value mega bundle.', price: '₹999', icon: '🏆', stock: 'Infinite', active: 1, tags: 'premium,bundle,featured', category: 'premium' },

    // ── Special packs ──
    { id: 'netflix-starter', name: 'Netflix Starter', description: 'Netflix 1 Month + Mystery Reward.', price: '₹299', icon: '🎬', stock: 'Infinite', active: 1, tags: 'bundle,entertainment,featured', category: 'entertainment' },
    { id: 'music-pack', name: 'Music Pack', description: 'Spotify 1 Month + YouTube Premium 1 Month.', price: '₹199', icon: '🎵', stock: 'Infinite', active: 1, tags: 'bundle,entertainment', category: 'entertainment' },
    { id: 'gamer-pack', name: 'Gamer Pack', description: 'Steam ₹500 + Google Play ₹100 + Minecraft NFA.', price: '₹699', icon: '🎮', stock: 'Infinite', active: 1, tags: 'bundle,gaming,featured', category: 'giftcard' },
    { id: 'ult-ent-pack', name: 'Ultimate Entertainment Pack', description: 'Netflix 1M + Spotify 1M + YouTube Premium 1M + Mystery Reward.', price: '₹799', icon: '🍿', stock: 'Infinite', active: 1, tags: 'bundle,entertainment,premium,featured', category: 'entertainment' },
    { id: 'ult-rewards-mega', name: 'Ultimate Rewards Mega Pack', description: 'Netflix + Spotify + YouTube Premium + ₹500 gaming voucher + Minecraft reward.', price: '₹1,499', icon: '👑', stock: 'Infinite', active: 1, tags: 'bundle,premium,vip,featured', category: 'premium' }
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
