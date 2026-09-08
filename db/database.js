const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'store.db'));

// Enable WAL for better concurrent performance
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    global_name TEXT,
    avatar TEXT,
    is_staff INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    last_login TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    price TEXT,
    status TEXT DEFAULT 'open',
    payment_proof TEXT,
    customer_note TEXT,
    staff_note TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price TEXT NOT NULL,
    icon TEXT,
    stock TEXT DEFAULT 'Infinite',
    active INTEGER DEFAULT 1
  );
`);

// Seed products if empty
const count = db.prepare('SELECT COUNT(*) as c FROM products').get().c;
if (count === 0) {
  const insert = db.prepare(`
    INSERT INTO products (id, name, description, price, icon, stock)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const products = [
    ['mcfa', 'MCFA', 'Minecraft Full Access account. Instant delivery after payment confirmation.', '₹300', '⛏️', 'Infinite'],
    ['robux', 'Robux', 'Roblox Robux top-up. Secure transfer via our trusted staff.', '$100', '💎', 'Infinite'],
    ['nfa', 'NFA', 'Non-Full Access account. Requires 2 invites from our Discord server.', '2 Invites', '🔑', 'Infinite'],
    ['crunchyroll', 'Crunchyroll Premium', 'Official value ~₹79–99/mo or ₹475/year in India. Competitive access.', 'Contact Staff', '🍥', 'Infinite'],
    ['ytpremium', 'YouTube Premium', 'Monthly plan. Our rate: ₹100 / month.', '₹100 / mo', '▶️', 'Infinite']
  ];

  const tx = db.transaction((items) => {
    for (const p of items) insert.run(...p);
  });
  tx(products);
}

module.exports = db;
