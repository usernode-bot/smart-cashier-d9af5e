/* Smart Cashier's API: shop loading, permission checks and every endpoint.
 * All routes sit behind the auth middleware in server.js; shop-scoped ones
 * load the caller's staff row and role, and 403 anything the role forbids.
 */
'use strict';

const express = require('express');
const stats = require('./stats');
const money = require('../public/money');

const IS_STAGING = process.env.USERNODE_ENV === 'staging';
const PERMS = ['register', 'products', 'finance', 'insights', 'staff'];
const CAT_COLORS = ['red', 'amber', 'teal', 'blue', 'plum', 'slate'];
const CAT_ICONS = ['cup', 'leaf', 'bowl', 'loaf', 'bottle', 'bag', 'box', 'tag'];

// ── Pure permission helpers (unit tested) ────────────────────────────────

// Does a role row allow `perm`? The Owner role always does.
function can(role, perm) {
  if (!role) return false;
  if (role.is_owner) return true;
  return !!role['can_' + perm];
}

// Check one change to roles or staff before it is applied. Returns null
// when allowed, or {error, message} naming the 4xx to answer with.
//   actorIsOwner — the caller holds the Owner role
//   ownerCount   — how many people would hold the Owner role afterwards
//   ownerRoleId  — the Owner role's id
//   action       — 'assign' | 'unassign' | 'edit_role' | 'delete_role'
//   roleId       — the role the action touches (assign/unassign: the one
//                  being given or taken)
function checkRoleChange(input) {
  const { actorIsOwner, ownerCount, ownerRoleId, action, roleId } = input;
  const touchingOwner = roleId != null && Number(roleId) === Number(ownerRoleId);
  if ((action === 'assign' || action === 'unassign') && touchingOwner && !actorIsOwner) {
    return { error: 'owner_only', message: 'Only an Owner can give or take the Owner role.' };
  }
  if (action === 'edit_role' && touchingOwner && input.rename && !actorIsOwner) {
    return { error: 'owner_only', message: 'Only an Owner can rename the Owner role.' };
  }
  if (action === 'delete_role' && touchingOwner) {
    return { error: 'owner_role', message: 'The Owner role can’t be deleted.' };
  }
  if ((action === 'assign' || action === 'unassign' || action === 'remove_staff') && ownerCount < 1) {
    return { error: 'last_owner', message: 'A shop always keeps at least one Owner.' };
  }
  return null;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function demoWanted(req) {
  return IS_STAGING && req.query.demo === '1';
}

function createApi(pool, ensureDemoShop) {
  const router = express.Router();

  // Load the shop in :id and the caller's staff row. Demo shops answer
  // only when the demo flag is present, so the plain route keeps the
  // production answer.
  async function loadShop(req, res, next) {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return res.status(404).json({ error: 'not_found' });
      const shop = (await pool.query(`SELECT * FROM shops WHERE id = $1`, [id])).rows[0];
      if (!shop || (shop.is_demo && !demoWanted(req))) return res.status(404).json({ error: 'not_found' });
      const row = (await pool.query(
        `SELECT st.id AS staff_id, st.username, r.*
         FROM staff st JOIN roles r ON r.id = st.role_id
         WHERE st.shop_id = $1 AND st.user_id = $2`,
        [shop.id, req.user.id])).rows[0];
      if (!row) return res.status(403).json({ error: 'not_staff' });
      req.shop = shop;
      req.role = row;
      const owner = (await pool.query(`SELECT id FROM roles WHERE shop_id=$1 AND is_owner`, [shop.id])).rows[0];
      req.ownerRoleId = owner ? owner.id : null;
      next();
    } catch (err) { next(err); }
  }

  function requirePerm(perm) {
    return (req, res, next) => {
      if (!can(req.role, perm)) return res.status(403).json({ error: 'forbidden', need: perm });
      next();
    };
  }

  function roleShape(r) {
    return {
      id: r.id, name: r.name, position: r.position, is_owner: r.is_owner,
      can_register: r.is_owner || r.can_register,
      can_products: r.is_owner || r.can_products,
      can_finance: r.is_owner || r.can_finance,
      can_insights: r.is_owner || r.can_insights,
      can_staff: r.is_owner || r.can_staff,
    };
  }

  const shopCols = `id, name, currency, time_zone, next_sale_no, is_demo`;

  function shopShape(s) { return { ...s, currency: String(s.currency).trim() }; }

  // ── /api/me ───────────────────────────────────────────────────────────
  router.get('/me', async (req, res, next) => {
    try {
      if (!req.user) return res.json({ guest: true });
      if (demoWanted(req)) await ensureDemoShop(pool, req.user, req.now);
      const rows = (await pool.query(
        `SELECT s.${shopCols.replace(/, /g, ', s.')}, st.role_id, r.name AS role_name, r.is_owner,
                r.can_register, r.can_products, r.can_finance, r.can_insights, r.can_staff
         FROM staff st
         JOIN shops s ON s.id = st.shop_id
         JOIN roles r ON r.id = st.role_id
         WHERE st.user_id = $1 ${demoWanted(req) ? 'AND s.is_demo' : 'AND NOT s.is_demo'}
         ORDER BY s.created_at`,
        [req.user.id])).rows;
      const shops = rows.map((r) => ({
        ...shopShape(r),
        role: roleShape({ ...r, name: r.role_name, position: 0 }),
      }));
      res.json({ user: { id: req.user.id, username: req.user.username }, shops, demo: demoWanted(req) });
    } catch (err) { next(err); }
  });

  // ── Shop setup ────────────────────────────────────────────────────────
  router.post('/shops', async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ error: 'account_required' });
      if (demoWanted(req)) return res.status(400).json({ error: 'demo_active', message: 'Turn off the demo to set up a real shop.' });
      const name = String(req.body.name || '').trim();
      const currency = String(req.body.currency || '').trim().toUpperCase();
      const timeZone = String(req.body.timeZone || '').trim();
      if (!name || name.length > 60) return res.status(400).json({ error: 'bad_name' });
      if (!money.CURRENCIES[currency]) return res.status(400).json({ error: 'bad_currency' });
      try { new Intl.DateTimeFormat('en', { timeZone }); } catch (e) { return res.status(400).json({ error: 'bad_time_zone' }); }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const shop = (await client.query(
          `INSERT INTO shops (name, currency, time_zone) VALUES ($1,$2,$3) RETURNING ${shopCols}`,
          [name, currency, timeZone])).rows[0];
        const owner = (await client.query(
          `INSERT INTO roles (shop_id, name, position, is_owner, can_register, can_products, can_finance, can_insights, can_staff)
           VALUES ($1,'Owner',0,true,true,true,true,true,true) RETURNING id`, [shop.id])).rows[0].id;
        const manager = (await client.query(
          `INSERT INTO roles (shop_id, name, position, is_owner, can_register, can_products, can_finance, can_insights, can_staff)
           VALUES ($1,'Manager',1,false,true,true,true,true,false) RETURNING id`, [shop.id])).rows[0].id;
        await client.query(
          `INSERT INTO roles (shop_id, name, position, is_owner, can_register, can_products, can_finance, can_insights, can_staff)
           VALUES ($1,'Cashier',2,false,true,false,false,false,false)`, [shop.id]);
        await client.query(
          `INSERT INTO categories (shop_id, name, color, icon, position) VALUES ($1,'General','slate','tag',0)`, [shop.id]);
        await client.query(
          `INSERT INTO staff (shop_id, user_id, username, role_id) VALUES ($1,$2,$3,$4)`,
          [shop.id, req.user.id, req.user.username, owner]);
        await client.query('COMMIT');
        res.json({ shop: shopShape(shop), role: { id: owner, name: 'Owner', is_owner: true }, managerRoleId: manager });
      } catch (err) { try { await client.query('ROLLBACK'); } catch (_) {} throw err; }
      finally { client.release(); }
    } catch (err) { next(err); }
  });

  router.patch('/shops/:id', loadShop, requirePerm('staff'), async (req, res, next) => {
    try {
      const s = req.shop;
      const name = req.body.name !== undefined ? String(req.body.name).trim() : s.name;
      const currency = req.body.currency !== undefined ? String(req.body.currency).trim().toUpperCase() : String(s.currency).trim();
      const timeZone = req.body.timeZone !== undefined ? String(req.body.timeZone).trim() : s.time_zone;
      if (!name || name.length > 60) return res.status(400).json({ error: 'bad_name' });
      if (!money.CURRENCIES[currency]) return res.status(400).json({ error: 'bad_currency' });
      try { new Intl.DateTimeFormat('en', { timeZone }); } catch (e) { return res.status(400).json({ error: 'bad_time_zone' }); }
      const updated = (await pool.query(
        `UPDATE shops SET name=$1, currency=$2, time_zone=$3 WHERE id=$4 RETURNING ${shopCols}`,
        [name, currency, timeZone, s.id])).rows[0];
      res.json({ shop: shopShape(updated) });
    } catch (err) { next(err); }
  });

  // ── Catalog ───────────────────────────────────────────────────────────
  router.get('/shops/:id/catalog', loadShop, async (req, res, next) => {
    try {
      const categories = (await pool.query(
        `SELECT id, name, color, icon, position FROM categories
         WHERE shop_id = $1 AND NOT archived ORDER BY position, id`, [req.shop.id])).rows;
      const products = (await pool.query(
        `SELECT id, category_id, name, price_cents, on_sale, position FROM products
         WHERE shop_id = $1 AND NOT archived ORDER BY position, id`, [req.shop.id])).rows;
      res.json({ categories, products });
    } catch (err) { next(err); }
  });

  function validProduct(body, res) {
    const name = String(body.name || '').trim();
    if (!name || name.length > 60) { res.status(400).json({ error: 'bad_name' }); return null; }
    const price = Number(body.priceCents);
    if (!Number.isInteger(price) || price < 0 || price > 1e12) { res.status(400).json({ error: 'bad_price' }); return null; }
    return { name, price };
  }

  router.post('/shops/:id/products', loadShop, requirePerm('products'), async (req, res, next) => {
    try {
      const v = validProduct(req.body, res); if (!v) return;
      const catId = req.body.categoryId ? Number(req.body.categoryId) : null;
      const row = (await pool.query(
        `INSERT INTO products (shop_id, category_id, name, price_cents, on_sale, position)
         VALUES ($1,$2,$3,$4,$5, (SELECT COALESCE(MAX(position),0)+1 FROM products WHERE shop_id=$1))
         RETURNING id, category_id, name, price_cents, on_sale`,
        [req.shop.id, catId, v.name, v.price, req.body.onSale === false ? false : true])).rows[0];
      res.json({ product: row });
    } catch (err) { next(err); }
  });

  router.patch('/shops/:id/products/:productId', loadShop, requirePerm('products'), async (req, res, next) => {
    try {
      const cur = (await pool.query(
        `SELECT * FROM products WHERE id = $1 AND shop_id = $2`,
        [Number(req.params.productId), req.shop.id])).rows[0];
      if (!cur) return res.status(404).json({ error: 'not_found' });
      const v = validProduct({ name: req.body.name !== undefined ? req.body.name : cur.name, priceCents: req.body.priceCents !== undefined ? req.body.priceCents : Number(cur.price_cents) }, res);
      if (!v) return;
      const catId = req.body.categoryId !== undefined ? (req.body.categoryId ? Number(req.body.categoryId) : null) : cur.category_id;
      const onSale = req.body.onSale !== undefined ? !!req.body.onSale : cur.on_sale;
      const archived = req.body.archived !== undefined ? !!req.body.archived : cur.archived;
      const row = (await pool.query(
        `UPDATE products SET name=$1, price_cents=$2, category_id=$3, on_sale=$4, archived=$5
         WHERE id=$6 RETURNING id, category_id, name, price_cents, on_sale, archived`,
        [v.name, v.price, catId, onSale, archived, cur.id])).rows[0];
      res.json({ product: row });
    } catch (err) { next(err); }
  });

  router.post('/shops/:id/categories', loadShop, requirePerm('products'), async (req, res, next) => {
    try {
      const name = String(req.body.name || '').trim();
      if (!name || name.length > 30) return res.status(400).json({ error: 'bad_name' });
      const color = CAT_COLORS.includes(req.body.color) ? req.body.color : 'slate';
      const icon = CAT_ICONS.includes(req.body.icon) ? req.body.icon : 'tag';
      const row = (await pool.query(
        `INSERT INTO categories (shop_id, name, color, icon, position)
         VALUES ($1,$2,$3,$4,(SELECT COALESCE(MAX(position),0)+1 FROM categories WHERE shop_id=$1))
         RETURNING id, name, color, icon, position`, [req.shop.id, name, color, icon])).rows[0];
      res.json({ category: row });
    } catch (err) { next(err); }
  });

  router.patch('/shops/:id/categories/:categoryId', loadShop, requirePerm('products'), async (req, res, next) => {
    try {
      const cur = (await pool.query(
        `SELECT * FROM categories WHERE id = $1 AND shop_id = $2`,
        [Number(req.params.categoryId), req.shop.id])).rows[0];
      if (!cur) return res.status(404).json({ error: 'not_found' });
      const name = req.body.name !== undefined ? String(req.body.name).trim() : cur.name;
      if (!name || name.length > 30) return res.status(400).json({ error: 'bad_name' });
      const color = req.body.color !== undefined ? req.body.color : cur.color;
      const icon = req.body.icon !== undefined ? req.body.icon : cur.icon;
      if (!CAT_COLORS.includes(color) || !CAT_ICONS.includes(icon)) return res.status(400).json({ error: 'bad_category' });
      const archived = req.body.archived !== undefined ? !!req.body.archived : cur.archived;
      const row = (await pool.query(
        `UPDATE categories SET name=$1, color=$2, icon=$3, archived=$4 WHERE id=$5
         RETURNING id, name, color, icon, position`,
        [name, color, icon, archived, cur.id])).rows[0];
      res.json({ category: row });
    } catch (err) { next(err); }
  });

  // ── Sales ─────────────────────────────────────────────────────────────
  router.post('/shops/:id/sales', loadShop, requirePerm('register'), async (req, res, next) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const shop = (await client.query(`SELECT * FROM shops WHERE id=$1 FOR UPDATE`, [req.shop.id])).rows[0];
      const existing = req.body.clientId
        ? (await client.query(
            `SELECT * FROM sales WHERE shop_id=$1 AND client_id=$2`,
            [shop.id, String(req.body.clientId)])).rows[0]
        : null;
      if (existing) {
        const items = (await client.query(`SELECT * FROM sale_items WHERE sale_id=$1 ORDER BY id`, [existing.id])).rows;
        await client.query('COMMIT');
        return res.json({ sale: saleShape(existing), items });
      }
      const items = Array.isArray(req.body.items) ? req.body.items : [];
      if (!items.length) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'no_items' }); }
      const method = req.body.method;
      if (!['cash', 'card', 'qr'].includes(method)) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'bad_method' }); }
      // Reprice from current products: a price that changed while the
      // receipt was open loses to the server's price.
      const ids = items.map((it) => Number(it.productId)).filter(Number.isInteger);
      const rows = (await client.query(
        `SELECT id, name, price_cents, category_id FROM products
         WHERE shop_id = $1 AND id = ANY($2) AND NOT archived AND on_sale`,
        [shop.id, ids])).rows;
      const byId = new Map(rows.map((r) => [r.id, r]));
      const missing = items.filter((it) => !byId.get(Number(it.productId)));
      if (missing.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'catalog_changed', missing: missing.map((m) => m.name || 'Product') });
      }
      const cats = (await client.query(
        `SELECT id, color, icon FROM categories WHERE shop_id=$1`, [shop.id])).rows;
      const catById = new Map(cats.map((c) => [c.id, c]));
      let total = 0;
      const priced = items.map((it) => {
        const p = byId.get(Number(it.productId));
        const qty = Math.max(1, Math.min(999, Math.floor(Number(it.qty) || 1)));
        const cat = catById.get(p.category_id) || {};
        total += Number(p.price_cents) * qty;
        return { product: p, qty, cat };
      });
      const cashReceived = req.body.cashReceivedCents;
      if (method === 'cash') {
        const c = cashReceived === undefined || cashReceived === null || cashReceived === '' ? total : Number(cashReceived);
        if (!Number.isInteger(c) || c < total) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'cash_short', short: total - (Number.isInteger(c) ? c : 0) });
        }
      } else if (cashReceived !== undefined && cashReceived !== null && cashReceived !== '') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'bad_cash' });
      }
      const no = (await client.query(
        `UPDATE shops SET next_sale_no = next_sale_no + 1 WHERE id = $1 RETURNING next_sale_no`,
        [shop.id])).rows[0].next_sale_no - 1;
      const sale = (await client.query(
        `INSERT INTO sales (shop_id, sale_no, client_id, cashier_user_id, cashier_username, method, total_cents, cash_received_cents, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [shop.id, no, String(req.body.clientId || ''), req.user.id, req.user.username, method, total,
          method === 'cash' ? (Number(cashReceived) || total) : null, req.now])).rows[0];
      const itemValues = [];
      const itemParams = [];
      let p = 1;
      for (const it of priced) {
        itemValues.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`);
        itemParams.push(sale.id, it.product.id, it.product.name, it.cat.color || null, it.cat.icon || null, Number(it.product.price_cents), it.qty);
      }
      const insertedItems = (await client.query(
        `INSERT INTO sale_items (sale_id, product_id, name, category_color, category_icon, unit_price_cents, qty)
         VALUES ${itemValues.join(',')} RETURNING *`, itemParams)).rows;
      await client.query('COMMIT');
      res.json({ sale: saleShape(sale), items: insertedItems });
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      next(err);
    } finally { client.release(); }
  });

  function saleShape(s) {
    return {
      id: s.id, saleNo: s.sale_no, method: s.method, totalCents: Number(s.total_cents),
      cashReceivedCents: s.cash_received_cents == null ? null : Number(s.cash_received_cents),
      cashierUsername: s.cashier_username, createdAt: s.created_at,
      voidedAt: s.voided_at, voidedBy: s.voided_by_username, voidReason: s.void_reason,
    };
  }

  router.get('/shops/:id/sales', loadShop, requirePerm('finance'), async (req, res, next) => {
    try {
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
      const before = Number(req.query.before) || null;
      const rows = (await pool.query(
        `SELECT * FROM sales WHERE shop_id = $1 ${before ? 'AND sale_no < $2' : ''}
         ORDER BY sale_no DESC LIMIT ${before ? '$3' : '$2'}`,
        before ? [req.shop.id, before, limit] : [req.shop.id, limit])).rows;
      res.json({ sales: rows.map(saleShape) });
    } catch (err) { next(err); }
  });

  router.get('/shops/:id/sales/:saleId', loadShop, requirePerm('finance'), async (req, res, next) => {
    try {
      const sale = (await pool.query(
        `SELECT * FROM sales WHERE id = $1 AND shop_id = $2`,
        [Number(req.params.saleId), req.shop.id])).rows[0];
      if (!sale) return res.status(404).json({ error: 'not_found' });
      const items = (await pool.query(`SELECT * FROM sale_items WHERE sale_id = $1 ORDER BY id`, [sale.id])).rows;
      res.json({ sale: saleShape(sale), items });
    } catch (err) { next(err); }
  });

  router.post('/shops/:id/sales/:saleId/void', loadShop, requirePerm('finance'), async (req, res, next) => {
    try {
      const sale = (await pool.query(
        `SELECT * FROM sales WHERE id = $1 AND shop_id = $2`,
        [Number(req.params.saleId), req.shop.id])).rows[0];
      if (!sale) return res.status(404).json({ error: 'not_found' });
      if (!sale.voided_at) {
        await pool.query(
          `UPDATE sales SET voided_at = $1, voided_by_username = $2, void_reason = $3 WHERE id = $4`,
          [req.now, req.user.username, req.body.reason ? String(req.body.reason).slice(0, 200) : null, sale.id]);
      }
      const fresh = (await pool.query(`SELECT * FROM sales WHERE id = $1`, [sale.id])).rows[0];
      res.json({ sale: saleShape(fresh) });
    } catch (err) { next(err); }
  });

  // ── Payouts ───────────────────────────────────────────────────────────
  router.get('/shops/:id/payouts', loadShop, requirePerm('finance'), async (req, res, next) => {
    try {
      const rows = (await pool.query(
        `SELECT * FROM payouts WHERE shop_id = $1 AND deleted_at IS NULL ORDER BY paid_on DESC, id DESC LIMIT 100`,
        [req.shop.id])).rows;
      res.json({
        payouts: rows.map((p) => ({
          id: p.id, amountCents: Number(p.amount_cents), paidTo: p.paid_to, note: p.note,
          paidOn: p.paid_on, loggedBy: p.logged_by_username, createdAt: p.created_at,
        })),
      });
    } catch (err) { next(err); }
  });

  router.post('/shops/:id/payouts', loadShop, requirePerm('finance'), async (req, res, next) => {
    try {
      const amount = Number(req.body.amountCents);
      const paidTo = String(req.body.paidTo || '').trim();
      if (!Number.isInteger(amount) || amount <= 0) return res.status(400).json({ error: 'bad_amount' });
      if (!paidTo || paidTo.length > 80) return res.status(400).json({ error: 'bad_paid_to' });
      const paidOn = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body.paidOn || '')) ? req.body.paidOn : req.now.toISOString().slice(0, 10);
      const note = req.body.note ? String(req.body.note).slice(0, 200) : null;
      const row = (await pool.query(
        `INSERT INTO payouts (shop_id, amount_cents, paid_to, note, paid_on, logged_by_username)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [req.shop.id, amount, paidTo, note, paidOn, req.user.username])).rows[0];
      res.json({ payout: { id: row.id, amountCents: Number(row.amount_cents), paidTo: row.paid_to, note: row.note, paidOn: row.paid_on, loggedBy: row.logged_by_username } });
    } catch (err) { next(err); }
  });

  router.delete('/shops/:id/payouts/:payoutId', loadShop, requirePerm('finance'), async (req, res, next) => {
    try {
      const r = await pool.query(
        `UPDATE payouts SET deleted_at = $1 WHERE id = $2 AND shop_id = $3 AND deleted_at IS NULL`,
        [req.now, Number(req.params.payoutId), req.shop.id]);
      res.json({ deleted: r.rowCount > 0 });
    } catch (err) { next(err); }
  });

  // ── Finance summary ───────────────────────────────────────────────────
  router.get('/shops/:id/finance/summary', loadShop, requirePerm('finance'), async (req, res, next) => {
    try {
      const period = ['today', 'week', 'month'].includes(req.query.period) ? req.query.period : 'today';
      const b = stats.periodBounds(req.now, req.shop.time_zone, period);
      const tz = req.shop.time_zone;
      const inRange = (start, end) => pool.query(
        `SELECT method, count(*)::int AS count, COALESCE(sum(total_cents),0)::bigint AS total
         FROM sales WHERE shop_id = $1 AND voided_at IS NULL AND created_at >= $2 AND created_at < $3
         GROUP BY method`, [req.shop.id, start.toISOString(), end.toISOString()]);
      const curRows = (await inRange(b.start, b.end)).rows;
      const prevRows = (await inRange(b.prevStart, b.prevEnd)).rows;
      const sum = (rows) => rows.reduce((a, r) => a + Number(r.total), 0);
      const count = (rows) => rows.reduce((a, r) => a + Number(r.count), 0);
      const byMethod = { cash: 0, card: 0, qr: 0 };
      for (const r of curRows) byMethod[r.method] = Number(r.total);
      const payouts = (await pool.query(
        `SELECT COALESCE(sum(amount_cents),0)::bigint AS total FROM payouts
         WHERE shop_id = $1 AND deleted_at IS NULL
           AND paid_on >= (($2::timestamptz AT TIME ZONE $3)::date)
           AND paid_on <  (($4::timestamptz AT TIME ZONE $3)::date + 1)`,
        [req.shop.id, b.start.toISOString(), tz, b.end.toISOString()])).rows[0];
      const notPaidOut = (await pool.query(
        `SELECT (SELECT COALESCE(sum(total_cents),0) FROM sales WHERE shop_id=$1 AND voided_at IS NULL)
              - (SELECT COALESCE(sum(amount_cents),0) FROM payouts WHERE shop_id=$1 AND deleted_at IS NULL)
              AS left`, [req.shop.id])).rows[0];
      const total = sum(curRows), n = count(curRows), prevTotal = sum(prevRows), prevN = count(prevRows);
      res.json({
        period,
        totalCents: total, count: n, averageCents: n ? Math.round(total / n) : 0,
        prevTotalCents: prevTotal, prevCount: prevN,
        byMethod, payoutsCents: Number(payouts.total),
        afterPayoutsCents: total - Number(payouts.total),
        notPaidOutCents: Number(notPaidOut.left),
      });
    } catch (err) { next(err); }
  });

  // ── Insights ──────────────────────────────────────────────────────────
  router.get('/shops/:id/insights', loadShop, requirePerm('insights'), async (req, res, next) => {
    try {
      const range = ['today', '7d', '30d'].includes(req.query.range) ? req.query.range : '7d';
      const tz = req.shop.time_zone;
      const b = stats.periodBounds(req.now, tz, range);
      const win = (start, end) => [req.shop.id, start.toISOString(), end.toISOString()];
      const [cur, prev, seriesRows, topRows, hourRows] = await Promise.all([
        pool.query(`SELECT count(*)::int AS count, COALESCE(sum(total_cents),0)::bigint AS total
                    FROM sales WHERE shop_id=$1 AND voided_at IS NULL AND created_at >= $2 AND created_at < $3`, ...[win(b.start, b.end)]),
        pool.query(`SELECT count(*)::int AS count, COALESCE(sum(total_cents),0)::bigint AS total
                    FROM sales WHERE shop_id=$1 AND voided_at IS NULL AND created_at >= $2 AND created_at < $3`, ...[win(b.prevStart, b.prevEnd)]),
        pool.query(`SELECT to_char(created_at AT TIME ZONE $4, 'YYYY-MM-DD') AS day,
                           sum(total_cents)::bigint AS total, count(*)::int AS count
                    FROM sales WHERE shop_id=$1 AND voided_at IS NULL AND created_at >= $2 AND created_at < $3
                    GROUP BY 1 ORDER BY 1`, [...win(b.start, b.end), tz]),
        pool.query(`SELECT si.product_id, si.name, max(si.category_color) AS color, max(si.category_icon) AS icon,
                           sum(si.qty)::int AS qty, sum(si.qty * si.unit_price_cents)::bigint AS total
                    FROM sale_items si JOIN sales s ON s.id = si.sale_id
                    WHERE s.shop_id=$1 AND s.voided_at IS NULL AND s.created_at >= $2 AND s.created_at < $3
                    GROUP BY si.product_id, si.name
                    ORDER BY qty DESC, total DESC LIMIT 5`, win(b.start, b.end)),
        pool.query(`SELECT EXTRACT(HOUR FROM (created_at AT TIME ZONE $4))::int AS hour,
                           count(*)::int AS count, sum(total_cents)::bigint AS total
                    FROM sales WHERE shop_id=$1 AND voided_at IS NULL AND created_at >= $2 AND created_at < $3
                    GROUP BY 1`, [...win(b.start, b.end), tz]),
      ]);
      const total = Number(cur.rows[0].total), n = Number(cur.rows[0].count);
      const prevTotal = Number(prev.rows[0].total), prevN = Number(prev.rows[0].count);
      const series = range === 'today'
        ? stats.fillHours(hourRows.rows).filter((h) => h.count > 0 || (h.hour >= 6 && h.hour <= 22))
        : stats.fillDays(seriesRows.rows, b, tz);
      res.json({
        range, totalCents: total, count: n, averageCents: n ? Math.round(total / n) : 0,
        prevTotalCents: prevTotal, prevCount: prevN,
        change: stats.percentChange(total, prevTotal),
        series, top: topRows.rows.map((r) => ({
          productId: r.product_id, name: r.name, color: r.color, icon: r.icon,
          qty: Number(r.qty), totalCents: Number(r.total),
        })),
        hours: stats.fillHours(hourRows.rows),
        busiest: stats.hourLabel(stats.busiestHour(stats.fillHours(hourRows.rows)) ?? -1) || null,
        busiestHour: stats.busiestHour(stats.fillHours(hourRows.rows)),
      });
    } catch (err) { next(err); }
  });

  // ── Staff ─────────────────────────────────────────────────────────────
  router.get('/shops/:id/staff', loadShop, async (req, res, next) => {
    try {
      const rows = (await pool.query(
        `SELECT st.id, st.user_id, st.username, st.role_id, r.name AS role_name, r.is_owner, st.created_at
         FROM staff st JOIN roles r ON r.id = st.role_id
         WHERE st.shop_id = $1 ORDER BY r.position, st.username`, [req.shop.id])).rows;
      res.json({
        staff: rows.map((r) => ({ id: r.id, userId: r.user_id, username: r.username, roleId: r.role_id, roleName: r.role_name, isOwner: r.is_owner })),
        callerStaffId: req.role.staff_id,
      });
    } catch (err) { next(err); }
  });

  async function platformLookup(req, kind, value) {
    const base = (process.env.USERNODE_PLATFORM_API_V1_URL || process.env.USERNODE_PLATFORM_API_URL || '').replace(/\/+$/, '');
    if (!base) throw Object.assign(new Error('no platform api'), { status: 503 });
    const headers = {};
    if (req.get('x-usernode-token')) headers['x-usernode-user-token'] = req.get('x-usernode-token');
    if (process.env.USERNODE_LLM_PROXY_TOKEN) headers['x-usernode-app-token'] = process.env.USERNODE_LLM_PROXY_TOKEN;
    const path = kind === 'search'
      ? `/users/search?q=${encodeURIComponent(value)}&limit=8`
      : `/users/lookup?username=${encodeURIComponent(value)}`;
    const res = await fetch(base + path, { headers });
    if (res.status === 404) return null;
    if (!res.ok) throw Object.assign(new Error('lookup failed'), { status: 503 });
    const data = await res.json();
    if (kind === 'search') return (data.users || data || []).map((u) => ({ id: u.id, username: u.username }));
    return data && data.username ? { id: data.id, username: data.username } : (data && data.id ? { id: data.id, username: data.username } : null);
  }

  router.post('/shops/:id/staff', loadShop, requirePerm('staff'), async (req, res, next) => {
    try {
      const username = String(req.body.username || '').trim().replace(/^@/, '');
      const roleId = Number(req.body.roleId);
      if (!username || username.length > 40) return res.status(400).json({ error: 'bad_username' });
      const role = (await pool.query(`SELECT * FROM roles WHERE id=$1 AND shop_id=$2`, [roleId, req.shop.id])).rows[0];
      if (!role) return res.status(400).json({ error: 'bad_role' });
      const ownerRole = (await pool.query(`SELECT id FROM roles WHERE shop_id=$1 AND is_owner`, [req.shop.id])).rows[0];
      const guard = checkRoleChange({ actorIsOwner: req.role.is_owner, ownerCount: 1, ownerRoleId: ownerRole ? ownerRole.id : null, action: 'assign', roleId });
      if (guard) return res.status(409).json({ error: guard.error, message: guard.message });
      let found;
      try { found = await platformLookup(req, 'lookup', username); } catch (err) {
        if (err.status === 503) return res.status(503).json({ error: 'lookup_unavailable', message: 'Couldn’t check that username. Try again.' });
        throw err;
      }
      if (!found || !found.id) return res.status(404).json({ error: 'no_such_user', message: 'No Homeroom user with that username.' });
      const dupe = (await pool.query(`SELECT id FROM staff WHERE shop_id=$1 AND user_id=$2`, [req.shop.id, found.id])).rows[0];
      if (dupe) return res.status(409).json({ error: 'already_staff', message: found.username + ' is already on the staff.' });
      const row = (await pool.query(
        `INSERT INTO staff (shop_id, user_id, username, role_id, added_by_username)
         VALUES ($1,$2,$3,$4,$5) RETURNING id, user_id, username, role_id`,
        [req.shop.id, found.id, found.username, roleId, req.user.username])).rows[0];
      res.json({ staff: { id: row.id, userId: row.user_id, username: row.username, roleId: row.role_id, roleName: role.name, isOwner: !!role.is_owner } });
    } catch (err) { next(err); }
  });

  function ownerRoleId(req) { return req.ownerRoleId; }

  async function ownerCountFor(pool, shopId) {
    const r = (await pool.query(
      `SELECT count(*)::int AS c FROM staff st JOIN roles r ON r.id = st.role_id
       WHERE st.shop_id = $1 AND r.is_owner`, [shopId])).rows[0];
    return r.c;
  }

  router.patch('/shops/:id/staff/:staffId', loadShop, async (req, res, next) => {
    try {
      const target = (await pool.query(
        `SELECT st.*, r.is_owner, r.id AS cur_role_id FROM staff st JOIN roles r ON r.id = st.role_id
         WHERE st.id = $1 AND st.shop_id = $2`, [Number(req.params.staffId), req.shop.id])).rows[0];
      if (!target) return res.status(404).json({ error: 'not_found' });
      if (!req.role.is_owner && !can(req.role, 'staff')) return res.status(403).json({ error: 'forbidden' });
      const newRoleId = Number(req.body.roleId);
      const newRole = (await pool.query(`SELECT * FROM roles WHERE id=$1 AND shop_id=$2`, [newRoleId, req.shop.id])).rows[0];
      if (!newRole) return res.status(400).json({ error: 'bad_role' });
      const wasOwner = target.is_owner;
      const becomesOwner = !!newRole.is_owner;
      let ownerCount = await ownerCountFor(pool, req.shop.id);
      if (wasOwner && !becomesOwner) ownerCount -= 1;
      if (!wasOwner && becomesOwner) ownerCount += 1;
      const action = becomesOwner && !wasOwner ? 'assign' : (!becomesOwner && wasOwner ? 'unassign' : null);
      if (action) {
        const guard = checkRoleChange({ actorIsOwner: req.role.is_owner, ownerCount, ownerRoleId: req.ownerRoleId, action, roleId: newRoleId });
        if (guard) return res.status(409).json({ error: guard.error, message: guard.message });
      }
      const row = (await pool.query(
        `UPDATE staff SET role_id = $1 WHERE id = $2 RETURNING id, user_id, username, role_id`,
        [newRoleId, target.id])).rows[0];
      res.json({ staff: { ...row, roleName: newRole.name, isOwner: !!newRole.is_owner } });
    } catch (err) { next(err); }
  });

  router.delete('/shops/:id/staff/:staffId', loadShop, async (req, res, next) => {
    try {
      const target = (await pool.query(
        `SELECT st.*, r.is_owner FROM staff st JOIN roles r ON r.id = st.role_id
         WHERE st.id = $1 AND st.shop_id = $2`, [Number(req.params.staffId), req.shop.id])).rows[0];
      if (!target) return res.status(404).json({ error: 'not_found' });
      if (target.user_id === req.user.id) return res.status(409).json({ error: 'last_owner', message: 'You can’t remove yourself. Ask another Owner.' });
      const ownerCount = await ownerCountFor(pool, req.shop.id) - (target.is_owner ? 1 : 0);
      const guard = checkRoleChange({ actorIsOwner: req.role.is_owner, ownerCount, ownerRoleId: req.ownerRoleId, action: 'unassign', roleId: target.role_id });
      if (guard) return res.status(409).json({ error: guard.error, message: guard.message });
      await pool.query(`DELETE FROM staff WHERE id = $1`, [target.id]);
      res.json({ removed: true });
    } catch (err) { next(err); }
  });

  // Username suggestions for Add staff. The page prefers the bridge's
  // usernode.searchUsers; this is the server fallback.
  router.get('/shops/:id/user-search', loadShop, requirePerm('staff'), async (req, res, next) => {
    try {
      const q = String(req.query.q || '').trim();
      if (!q) return res.json({ users: [] });
      res.json({ users: await platformLookup(req, 'search', q) || [] });
    } catch (err) {
      if (err.status === 503) return res.json({ users: [] });
      next(err);
    }
  });

  // ── Roles ─────────────────────────────────────────────────────────────
  router.get('/shops/:id/roles', loadShop, async (req, res, next) => {
    try {
      const roles = (await pool.query(
        `SELECT r.*, (SELECT count(*)::int FROM staff st WHERE st.role_id = r.id) AS holders
         FROM roles r WHERE r.shop_id = $1 ORDER BY r.position, r.id`, [req.shop.id])).rows;
      res.json({ roles: roles.map((r) => ({ ...roleShape(r), holders: Number(r.holders) })) });
    } catch (err) { next(err); }
  });

  router.post('/shops/:id/roles', loadShop, requirePerm('staff'), async (req, res, next) => {
    try {
      const name = String(req.body.name || '').trim();
      if (!name || name.length > 30) return res.status(400).json({ error: 'bad_name' });
      const perms = req.body.perms || {};
      const pos = (await pool.query(`SELECT COALESCE(MAX(position),0)+1 AS p FROM roles WHERE shop_id=$1`, [req.shop.id])).rows[0].p;
      const row = (await pool.query(
        `INSERT INTO roles (shop_id, name, position, is_owner, can_register, can_products, can_finance, can_insights, can_staff)
         VALUES ($1,$2,$3,false,$4,$5,$6,$7,$8) RETURNING *`,
        [req.shop.id, name, pos, !!perms.register, !!perms.products, !!perms.finance, !!perms.insights, !!perms.staff])).rows[0];
      res.json({ role: { ...roleShape(row), holders: 0 } });
    } catch (err) { next(err); }
  });

  router.patch('/shops/:id/roles/:roleId', loadShop, requirePerm('staff'), async (req, res, next) => {
    try {
      const role = (await pool.query(`SELECT * FROM roles WHERE id=$1 AND shop_id=$2`, [Number(req.params.roleId), req.shop.id])).rows[0];
      if (!role) return res.status(404).json({ error: 'not_found' });
      const rename = req.body.name !== undefined && String(req.body.name).trim() !== role.name;
      const name = req.body.name !== undefined ? String(req.body.name).trim() : role.name;
      if (!name || name.length > 30) return res.status(400).json({ error: 'bad_name' });
      if (rename) {
        const guard = checkRoleChange({ actorIsOwner: req.role.is_owner, ownerCount: 1, ownerRoleId: req.ownerRoleId, action: 'edit_role', roleId: role.id, rename: true });
        if (guard) return res.status(409).json({ error: guard.error, message: guard.message });
      }
      const sets = ['name = $1'];
      const params = [name];
      if (!role.is_owner && req.body.perms) {
        let p = 2;
        for (const perm of PERMS) { sets.push(`can_${perm} = $${p++}`); params.push(!!req.body.perms[perm]); }
      }
      if (req.body.position !== undefined) { sets.push(`position = $${params.length + 1}`); params.push(Number(req.body.position) || 0); }
      const row = (await pool.query(
        `UPDATE roles SET ${sets.join(', ')} WHERE id = ${role.id} RETURNING *`, params)).rows[0];
      res.json({ role: roleShape(row) });
    } catch (err) { next(err); }
  });

  router.delete('/shops/:id/roles/:roleId', loadShop, requirePerm('staff'), async (req, res, next) => {
    try {
      const role = (await pool.query(`SELECT * FROM roles WHERE id=$1 AND shop_id=$2`, [Number(req.params.roleId), req.shop.id])).rows[0];
      if (!role) return res.status(404).json({ error: 'not_found' });
      const guard = checkRoleChange({ actorIsOwner: req.role.is_owner, ownerCount: 1, ownerRoleId: req.ownerRoleId, action: 'delete_role', roleId: role.id });
      if (guard) return res.status(409).json({ error: guard.error, message: guard.message });
      const holders = (await pool.query(`SELECT count(*)::int AS c FROM staff WHERE role_id=$1`, [role.id])).rows[0].c;
      if (holders > 0) return res.status(409).json({ error: 'role_in_use', message: 'Someone still holds that role. Move them first.' });
      await pool.query(`DELETE FROM roles WHERE id = $1`, [role.id]);
      res.json({ deleted: true });
    } catch (err) { next(err); }
  });

  // Attach loadShop's staff context before the router-level middleware above
  // runs for the staff/roles sub-paths: express matches router.use after the
  // path-specific handlers registered earlier, so pre-register loadShop there.
  return router;
}

module.exports = { createApi, can, checkRoleChange, PERMS };
