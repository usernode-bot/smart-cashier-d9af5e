/* The staging demo shop: a made-up coffee shop seeded once per viewing
 * account, only when IS_STAGING && req.query.demo === '1', inside an
 * advisory-locked transaction so a reload changes nothing. Everything is
 * obviously fake ("demo-" usernames, made-up suppliers).
 */
'use strict';

const stats = require('./stats');

// Fixed-seed PRNG so the shop looks the same on every fresh seed.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CATEGORIES = [
  { name: 'Coffee', color: 'amber', icon: 'cup' },
  { name: 'Tea', color: 'teal', icon: 'leaf' },
  { name: 'Food', color: 'red', icon: 'bowl' },
  { name: 'Bakes', color: 'plum', icon: 'loaf' },
  { name: 'Drinks', color: 'blue', icon: 'bottle' },
];

// [name, price in RM, category index]
const PRODUCTS = [
  ['Flat white', 9.5, 0], ['Iced latte', 10, 0], ['Kopi O', 4.5, 0],
  ['Mocha', 11, 0], ['Americano', 8, 0],
  ['Teh tarik', 4.8, 1], ['Iced lemon tea', 5.5, 1], ['Matcha latte', 12, 1],
  ['Nasi lemak', 8.9, 2], ['Chicken wrap', 12.5, 2], ['Mee goreng', 9.8, 2],
  ['Banana bread', 6.5, 3], ['Butter croissant', 7.2, 3], ['Kaya toast', 4.2, 3],
  ['Mineral water', 2, 4],
];

const ROLES = [
  { name: 'Owner', is_owner: true, all: true },
  { name: 'Manager', is_owner: false, perms: ['register', 'products', 'finance', 'insights'] },
  { name: 'Shift lead', is_owner: false, perms: ['register', 'products', 'insights'] },
  { name: 'Cashier', is_owner: false, perms: ['register'] },
];

const STAFF = [
  { user_id: -1, username: 'demo-ayu', role: 'Manager' },
  { user_id: -2, username: 'demo-bima', role: 'Shift lead' },
  { user_id: -3, username: 'demo-citra', role: 'Cashier' },
  { user_id: -4, username: 'demo-dewi', role: 'Cashier' },
];

const PAYOUTS = [
  { amount: 120000, paid_to: "Owner's bank account", note: 'Week one takings', daysBack: 12 },
  { amount: 45000, paid_to: 'Supplier: Bean & Leaf Roasters (made up)', note: 'Coffee beans', daysBack: 6 },
  { amount: 8000, paid_to: 'Petty cash for milk', note: null, daysBack: 2 },
];

const METHODS = ['cash', 'cash', 'cash', 'cash', 'cash', 'qr', 'qr', 'qr', 'card', 'qr', 'card', 'cash', 'qr', 'cash', 'card', 'qr', 'cash', 'card', 'cash', 'qr'];

module.exports = async function ensureDemoShop(pool, user, now) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('sc-demo:' || $1))`, [user.id]);
    const ins = await client.query(
      `INSERT INTO shops (name, currency, time_zone, is_demo, demo_owner_id)
       VALUES ('Senja Coffee Corner', 'MYR', 'Asia/Kuala_Lumpur', true, $1)
       ON CONFLICT (demo_owner_id) WHERE is_demo DO NOTHING
       RETURNING id`,
      [user.id]);
    if (ins.rows.length === 0) {
      await client.query('COMMIT');
      return; // already seeded; the viewer's own edits stay
    }
    const shopId = ins.rows[0].id;

    // Roles
    const roleIds = {};
    for (let i = 0; i < ROLES.length; i++) {
      const r = ROLES[i];
      const res = await client.query(
        `INSERT INTO roles (shop_id, name, position, is_owner, can_register, can_products, can_finance, can_insights, can_staff)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [shopId, r.name, i, r.is_owner,
          r.all || r.perms.includes('register'), r.all || r.perms.includes('products'),
          r.all || r.perms.includes('finance'), r.all || r.perms.includes('insights'),
          r.all || r.perms.includes('staff')]);
      roleIds[r.name] = res.rows[0].id;
    }

    // Staff: the viewer as Owner, then the made-up crew
    await client.query(
      `INSERT INTO staff (shop_id, user_id, username, role_id, added_by_username)
       VALUES ($1,$2,$3,$4,$5)`,
      [shopId, user.id, user.username, roleIds['Owner'], null]);
    for (const s of STAFF) {
      await client.query(
        `INSERT INTO staff (shop_id, user_id, username, role_id, added_by_username)
         VALUES ($1,$2,$3,$4,$5)`,
        [shopId, s.user_id, s.username, roleIds[s.role], user.username]);
    }

    // Categories and products
    const catIds = [];
    for (let i = 0; i < CATEGORIES.length; i++) {
      const c = CATEGORIES[i];
      const res = await client.query(
        `INSERT INTO categories (shop_id, name, color, icon, position) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [shopId, c.name, c.color, c.icon, i]);
      catIds.push(res.rows[0].id);
    }
    const productIds = [];
    for (const [name, price, cat] of PRODUCTS) {
      const res = await client.query(
        `INSERT INTO products (shop_id, category_id, name, price_cents, position)
         VALUES ($1,$2,$3,$4,$5) RETURNING id, price_cents, name`,
        [shopId, catIds[cat], name, Math.round(price * 100), productIds.length]);
      productIds.push(res.rows[0]);
    }

    // About two weeks of sales ending at `now`, weighted to the morning and
    // lunch rushes, rung up by the staff and the viewer.
    const tz = 'Asia/Kuala_Lumpur';
    const rand = mulberry32(20261012);
    const cashiers = ['demo-ayu', 'demo-bima', 'demo-citra', 'demo-dewi', user.username, user.username];
    const saleRows = []; // {createdAt, method, total, cash, cashier, saleNo, voided}
    const itemRows = []; // per sale: [{prod, qty, price}]
    let saleNo = 1;
    const dayStart = stats.startOfDay(now, tz).getTime();
    for (let back = 15; back >= 0; back--) {
      const count = back === 0 ? 9 : Math.round(18 + rand() * 14);
      const dayBase = dayStart - back * 86400000;
      const dayIdx = [];
      for (let i = 0; i < count; i++) {
        const r = rand();
        let h;
        if (r < 0.42) h = 7 + Math.floor(rand() * 3);        // morning rush
        else if (r < 0.62) h = 12 + Math.floor(rand() * 2);  // lunch rush
        else h = 10 + Math.floor(rand() * 10);
        if (h > 20) h = 20;
        const createdAt = new Date(dayBase + h * 3600000 + Math.floor(rand() * 60) * 60000 + Math.floor(rand() * 60000));
        if (back === 0 && createdAt.getTime() > now.getTime()) continue;
        const nLines = 1 + Math.floor(rand() * 4);
        const items = [];
        let total = 0;
        for (let l = 0; l < nLines; l++) {
          const idx = Math.floor(rand() * productIds.length);
          const qty = 1 + Math.floor(rand() * 2);
          const price = Number(productIds[idx].price_cents);
          items.push({ idx, qty, price });
          total += price * qty;
        }
        const method = METHODS[Math.floor(rand() * METHODS.length)];
        const cash = method === 'cash' ? Math.ceil(total / 1000) * 1000 : null;
        const row = {
          createdAt, method, total, cash,
          cashier: cashiers[Math.floor(rand() * cashiers.length)],
          saleNo, voided: null,
        };
        saleRows.push(row);
        itemRows.push(items);
        dayIdx.push(saleRows.length - 1);
        saleNo++;
      }
      if (back === 9 && dayIdx.length > 3) {
        saleRows[dayIdx[0]].voided = 'Rang up twice';
        saleRows[dayIdx[1]].voided = 'Rang up twice';
      }
    }

    // Batch-insert sales, then their items, chunked multi-row inserts.
    const saleIds = [];
    for (let i = 0; i < saleRows.length; i += 200) {
      const chunk = saleRows.slice(i, i + 200);
      const values = [];
      const params = [];
      let p = 1;
      for (const s of chunk) {
        values.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`);
        params.push(shopId, s.saleNo, s.cashier, s.method, s.total, s.cash,
          s.createdAt.toISOString(),
          s.voided ? new Date(s.createdAt.getTime() + 600000).toISOString() : null);
      }
      const res = await client.query(
        `INSERT INTO sales (shop_id, sale_no, cashier_username, method, total_cents, cash_received_cents, created_at, voided_at)
         VALUES ${values.join(',')} RETURNING id`, params);
      for (const row of res.rows) saleIds.push(row.id);
    }

    const tuples = []; // [saleId, productId, name, color, icon, price, qty]
    for (let i = 0; i < saleRows.length; i++) {
      for (const it of itemRows[i]) {
        const prod = productIds[it.idx];
        const cat = CATEGORIES[PRODUCTS[it.idx][2]];
        tuples.push([saleIds[i], prod.id, prod.name, cat.color, cat.icon, it.price, it.qty]);
      }
    }
    for (let i = 0; i < tuples.length; i += 300) {
      const chunk = tuples.slice(i, i + 300);
      const values = [];
      const params = [];
      let p = 1;
      for (const t of chunk) {
        values.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`);
        params.push(...t);
      }
      await client.query(
        `INSERT INTO sale_items (sale_id, product_id, name, category_color, category_icon, unit_price_cents, qty)
         VALUES ${values.join(',')}`, params);
    }

    // Payouts on real dates inside the window.
    for (const py of PAYOUTS) {
      await client.query(
        `INSERT INTO payouts (shop_id, amount_cents, paid_to, note, paid_on, logged_by_username)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [shopId, py.amount, py.paid_to, py.note,
          new Date(dayStart - py.daysBack * 86400000).toISOString().slice(0, 10),
          user.username]);
    }

    await client.query(`UPDATE shops SET next_sale_no = $2 WHERE id = $1`, [shopId, saleNo]);
    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
};
