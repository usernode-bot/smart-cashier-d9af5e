/* Idempotent DDL for Smart Cashier. Runs on boot. Every table is
 * staging:private: sales, payouts and staff are financial and personal
 * data, so staging copies get the schema only, never production rows.
 * Foreign keys stay within the private set.
 */
module.exports = async function ensureSchema(pool) {
  const q = (text) => pool.query(text);
  await q(`
    CREATE TABLE IF NOT EXISTS shops (
      id serial PRIMARY KEY,
      name text NOT NULL,
      currency char(3) NOT NULL,
      time_zone text NOT NULL,
      next_sale_no int NOT NULL DEFAULT 1,
      is_demo bool NOT NULL DEFAULT false,
      demo_owner_id int NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
  await q(`CREATE UNIQUE INDEX IF NOT EXISTS shops_demo_owner
           ON shops (demo_owner_id) WHERE is_demo`);
  await q(`
    CREATE TABLE IF NOT EXISTS roles (
      id serial PRIMARY KEY,
      shop_id int NOT NULL REFERENCES shops(id),
      name text NOT NULL,
      position int NOT NULL DEFAULT 0,
      is_owner bool NOT NULL DEFAULT false,
      can_register bool NOT NULL DEFAULT false,
      can_products bool NOT NULL DEFAULT false,
      can_finance bool NOT NULL DEFAULT false,
      can_insights bool NOT NULL DEFAULT false,
      can_staff bool NOT NULL DEFAULT false
    )`);
  await q(`
    CREATE TABLE IF NOT EXISTS staff (
      id serial PRIMARY KEY,
      shop_id int NOT NULL REFERENCES shops(id),
      user_id int NOT NULL,
      username text NOT NULL,
      role_id int NOT NULL REFERENCES roles(id),
      added_by_username text,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (shop_id, user_id)
    )`);
  await q(`
    CREATE TABLE IF NOT EXISTS categories (
      id serial PRIMARY KEY,
      shop_id int NOT NULL REFERENCES shops(id),
      name text NOT NULL,
      color text NOT NULL DEFAULT 'slate'
        CHECK (color IN ('red','amber','teal','blue','plum','slate')),
      icon text NOT NULL DEFAULT 'tag'
        CHECK (icon IN ('cup','leaf','bowl','loaf','bottle','bag','box','tag')),
      position int NOT NULL DEFAULT 0,
      archived bool NOT NULL DEFAULT false
    )`);
  await q(`
    CREATE TABLE IF NOT EXISTS products (
      id serial PRIMARY KEY,
      shop_id int NOT NULL REFERENCES shops(id),
      category_id int REFERENCES categories(id),
      name text NOT NULL,
      price_cents bigint NOT NULL CHECK (price_cents >= 0),
      on_sale bool NOT NULL DEFAULT true,
      archived bool NOT NULL DEFAULT false,
      position int NOT NULL DEFAULT 0
    )`);
  await q(`
    CREATE TABLE IF NOT EXISTS sales (
      id serial PRIMARY KEY,
      shop_id int NOT NULL REFERENCES shops(id),
      sale_no int NOT NULL,
      client_id uuid NULL,
      cashier_user_id int NULL,
      cashier_username text NOT NULL,
      method text NOT NULL CHECK (method IN ('cash','card','qr')),
      total_cents bigint NOT NULL,
      cash_received_cents bigint NULL,
      created_at timestamptz NOT NULL,
      voided_at timestamptz NULL,
      voided_by_username text NULL,
      void_reason text NULL,
      UNIQUE (shop_id, sale_no),
      UNIQUE (shop_id, client_id)
    )`);
  await q(`CREATE INDEX IF NOT EXISTS sales_shop_created ON sales (shop_id, created_at)`);
  await q(`
    CREATE TABLE IF NOT EXISTS sale_items (
      id serial PRIMARY KEY,
      sale_id int NOT NULL REFERENCES sales(id),
      product_id int NULL REFERENCES products(id),
      name text NOT NULL,
      category_color text NULL,
      category_icon text NULL,
      unit_price_cents bigint NOT NULL,
      qty int NOT NULL CHECK (qty > 0)
    )`);
  await q(`
    CREATE TABLE IF NOT EXISTS payouts (
      id serial PRIMARY KEY,
      shop_id int NOT NULL REFERENCES shops(id),
      amount_cents bigint NOT NULL CHECK (amount_cents > 0),
      paid_to text NOT NULL,
      note text NULL,
      paid_on date NOT NULL,
      logged_by_username text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz NULL
    )`);

  await q(`
    CREATE TABLE IF NOT EXISTS social_identities (
      id serial PRIMARY KEY,
      user_id int NOT NULL,
      username text NOT NULL,
      provider text NOT NULL CHECK (provider IN ('google','apple')),
      provider_subject text NOT NULL,
      email text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      last_signin_at timestamptz NULL,
      UNIQUE (provider, provider_subject),
      UNIQUE (user_id, provider)
    )`);
  await q(`CREATE INDEX IF NOT EXISTS social_identities_email
           ON social_identities (provider, lower(email))`);
  await q(`
    CREATE TABLE IF NOT EXISTS oauth_states (
      state text PRIMARY KEY,
      provider text NOT NULL,
      mode text NOT NULL CHECK (mode IN ('link','signin')),
      user_id int NULL,
      code_verifier text NOT NULL,
      redirect_uri text NOT NULL,
      status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','failed')),
      error text NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
  await q(`
    CREATE TABLE IF NOT EXISTS app_keys (
      name text PRIMARY KEY,
      secret text NOT NULL
    )`);

  // Financial and personal data — plus auth material (identities, OAuth
  // states, the session key) — never copy into staging.
  for (const t of ['shops', 'roles', 'staff', 'categories', 'products', 'sales', 'sale_items', 'payouts', 'social_identities', 'oauth_states', 'app_keys']) {
    await q(`COMMENT ON TABLE ${t} IS 'staging:private'`);
  }
};
