import { Router } from 'express';

const MAX_QUANTITY = 2147483647;
const MAX_PRICE = 9999999999.99;
const fields = ['make', 'model', 'category', 'price', 'quantity', 'imageUrl'];
const serialize = ({ image_url, ...vehicle }) => ({ ...vehicle, price: Number(vehicle.price), imageUrl: image_url || null });
const validPrice = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_PRICE && Math.abs(value * 100 - Math.round(value * 100)) < 0.0001;
const validQuantity = value => Number.isInteger(value) && value >= 0 && value <= MAX_QUANTITY;
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export async function initializeVehicles(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS vehicles (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    make VARCHAR(100) NOT NULL CHECK (length(trim(make)) > 0),
    model VARCHAR(100) NOT NULL CHECK (length(trim(model)) > 0),
    category VARCHAR(100) NOT NULL CHECK (length(trim(category)) > 0),
    price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
    quantity INTEGER NOT NULL CHECK (quantity >= 0)
  )`);
  await db.query('ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS image_url VARCHAR(2048)');
}

function vehicleInput(body) {
  if (!isObject(body) || Object.keys(body).some(key => !fields.includes(key))) return null;
  const text = ['make', 'model', 'category'].map(key => typeof body[key] === 'string' ? body[key].trim() : '');
  if (text.some(value => !value || value.length > 100 || value.includes('\0')) || !validPrice(body.price) || !validQuantity(body.quantity)) return null;
  let image = null;
  if (body.imageUrl !== undefined && body.imageUrl !== null && body.imageUrl !== '') {
    if (typeof body.imageUrl !== 'string' || body.imageUrl.length > 2048) return null;
    if (/^\/cars\/[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp|avif)$/i.test(body.imageUrl)) {
      return [...text, body.price, body.quantity, body.imageUrl];
    }
    try {
      const url = new URL(body.imageUrl.trim());
      if (url.protocol !== 'https:' || url.username || url.password) return null;
      image = url.href;
      if (image.length > 2048) return null;
    } catch { return null; }
  }
  return [...text, body.price, body.quantity, image];
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Administrator access is required.' });
  next();
}

export function createVehicleRouter(db) {
  const router = Router();
  router.param('id', (req, res, next, id) => {
    if (!/^[1-9]\d*$/.test(id) || Number(id) > MAX_QUANTITY) return res.status(400).json({ message: 'Vehicle ID must be a positive integer.' });
    next();
  });

  async function list(req, res) {
    const allowed = ['make', 'model', 'category', 'minPrice', 'maxPrice'];
    if (Object.keys(req.query).some(key => !allowed.includes(key))) return res.status(400).json({ message: 'Unsupported search parameter.' });
    const clauses = [], values = [];
    for (const key of ['make', 'model', 'category']) {
      if (req.query[key] === undefined) continue;
      const value = req.query[key];
      if (typeof value !== 'string' || !value.trim() || value.length > 100 || value.includes('\0')) return res.status(400).json({ message: `Invalid ${key} filter.` });
      values.push(value.trim());
      // strpos treats percent and underscore as literal text, not SQL wildcards.
      clauses.push(key === 'category' ? `lower(category) = lower($${values.length})` : `strpos(lower(${key}), lower($${values.length})) > 0`);
    }
    const prices = {};
    for (const key of ['minPrice', 'maxPrice']) {
      if (req.query[key] === undefined) continue;
      const raw = req.query[key];
      if (typeof raw !== 'string' || !/^\d+(\.\d{1,2})?$/.test(raw) || !validPrice(Number(raw))) return res.status(400).json({ message: `Invalid ${key} filter.` });
      prices[key] = Number(raw);
      values.push(prices[key]);
      clauses.push(`price ${key === 'minPrice' ? '>=' : '<='} $${values.length}`);
    }
    if (prices.minPrice !== undefined && prices.maxPrice !== undefined && prices.minPrice > prices.maxPrice) return res.status(400).json({ message: 'minPrice cannot exceed maxPrice.' });
    const { rows } = await db.query(`SELECT * FROM vehicles${clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''} ORDER BY id`, values);
    res.json({ vehicles: rows.map(serialize) });
  }
  router.get('/', list);
  router.get('/search', list);
  router.get('/:id', async (req, res) => {
    const { rows: [vehicle] } = await db.query('SELECT * FROM vehicles WHERE id = $1', [req.params.id]);
    if (!vehicle) return res.status(404).json({ message: 'Vehicle not found.' });
    res.json({ vehicle: serialize(vehicle) });
  });
  router.post('/', async (req, res) => {
    const input = vehicleInput(req.body);
    if (!input) return res.status(400).json({ message: 'Provide make, model, category, a non-negative price with at most two decimals, and an integer quantity.' });
    const { rows: [vehicle] } = await db.query('INSERT INTO vehicles (make, model, category, price, quantity, image_url) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', input);
    res.status(201).location(`/api/vehicles/${vehicle.id}`).json({ vehicle: serialize(vehicle) });
  });
  router.put('/:id', async (req, res) => {
    const input = vehicleInput(req.body);
    if (!input) return res.status(400).json({ message: 'Provide all five vehicle fields with valid values.' });
    const { rows: [vehicle] } = await db.query('UPDATE vehicles SET make=$1, model=$2, category=$3, price=$4, quantity=$5, image_url=CASE WHEN $8 THEN $6 ELSE image_url END WHERE id=$7 RETURNING *', [...input, req.params.id, Object.hasOwn(req.body, 'imageUrl')]);
    if (!vehicle) return res.status(404).json({ message: 'Vehicle not found.' });
    res.json({ vehicle: serialize(vehicle) });
  });
  router.delete('/:id', adminOnly, async (req, res) => {
    const { rowCount } = await db.query('DELETE FROM vehicles WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ message: 'Vehicle not found.' });
    res.status(204).end();
  });

  function changeStock(restock) {
    return async (req, res) => {
      const body = req.body === undefined ? {} : req.body;
      if (!isObject(body) || Object.keys(body).some(key => key !== 'quantity')) return res.status(400).json({ message: 'Only quantity is accepted.' });
      const quantity = body.quantity === undefined ? 1 : body.quantity;
      if (!validQuantity(quantity) || quantity === 0) return res.status(400).json({ message: 'Quantity must be a positive integer.' });
      // PostgreSQL locks the matching row and rechecks this condition after waiting.
      // The stock check and mutation must stay together in one statement.
      const sql = restock
        ? 'UPDATE vehicles SET quantity=quantity+$1 WHERE id=$2 AND quantity <= 2147483647-$1 RETURNING *'
        : 'UPDATE vehicles SET quantity=quantity-$1 WHERE id=$2 AND quantity >= $1 RETURNING *';
      const { rows: [vehicle] } = await db.query(sql, [quantity, req.params.id]);
      if (vehicle) return res.json({ vehicle: serialize(vehicle) });
      const { rowCount } = await db.query('SELECT id FROM vehicles WHERE id=$1', [req.params.id]);
      if (!rowCount) return res.status(404).json({ message: 'Vehicle not found.' });
      res.status(409).json({ message: restock ? 'Restock would exceed the maximum quantity.' : 'Insufficient stock.' });
    };
  }
  router.post('/:id/purchase', changeStock(false));
  router.post('/:id/restock', adminOnly, changeStock(true));
  return router;
}
