const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// =======================
// MIDDLEWARE
// =======================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// LOG REQUESTS
app.use((req, res, next) => {
    console.log(`📡 ${req.method} ${req.url}`);
    next();
});

// SERVE FRONTEND
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// =======================
// DATABASE (FIXED)
// =======================
const db = new Database('./cars.db');

console.log("✅ Connected to SQLite (better-sqlite3)");

// =======================
// CREATE TABLES (SYNC FIX)
// =======================
db.prepare(`
CREATE TABLE IF NOT EXISTS cars (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    make TEXT NOT NULL,
    model TEXT NOT NULL,
    year INTEGER,
    price INTEGER NOT NULL,
    mileage INTEGER,
    color TEXT,
    description TEXT,
    image TEXT,
    status TEXT DEFAULT 'available',
    soldDate TEXT,
    createdAt TEXT DEFAULT (datetime('now'))
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS enquiries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    carId INTEGER,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    message TEXT,
    status TEXT DEFAULT 'new',
    viewed INTEGER DEFAULT 0,
    viewedAt TEXT,
    repliedAt TEXT,
    createdAt TEXT DEFAULT (datetime('now'))
)
`).run();

// =======================
// ROOT
// =======================
app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// =======================
// CAR ROUTES
// =======================

// ADD CAR
app.post('/api/cars', (req, res) => {
    const { make, model, year, price, mileage, color, description, image } = req.body;

    if (!make || !model || !price) {
        return res.status(400).json({ error: "Make, model, price required" });
    }

    const stmt = db.prepare(`
        INSERT INTO cars (make, model, year, price, mileage, color, description, image, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'available')
    `);

    const result = stmt.run(make, model, year, price, mileage, color, description, image);

    res.json({ success: true, id: result.lastInsertRowid });
});

// GET CARS
app.get('/api/cars', (req, res) => {
    const rows = db.prepare("SELECT * FROM cars WHERE status='available' ORDER BY id DESC").all();
    res.json(rows);
});

// GET ONE CAR
app.get('/api/cars/:id', (req, res) => {
    const row = db.prepare("SELECT * FROM cars WHERE id=?").get(req.params.id);

    if (!row) return res.status(404).json({ error: "Not found" });

    res.json(row);
});

// UPDATE CAR
app.put('/api/cars/:id', (req, res) => {
    const { make, model, year, price, mileage, color, description, image } = req.body;

    const stmt = db.prepare(`
        UPDATE cars
        SET make=?, model=?, year=?, price=?, mileage=?, color=?, description=?, image=?
        WHERE id=?
    `);

    const result = stmt.run(make, model, year, price, mileage, color, description, image, req.params.id);

    res.json({ updated: result.changes });
});

// DELETE CAR
app.delete('/api/cars/:id', (req, res) => {
    const result = db.prepare("DELETE FROM cars WHERE id=?").run(req.params.id);
    res.json({ deleted: result.changes });
});

// SELL CAR
app.post('/api/sell', (req, res) => {
    const { id } = req.body;

    const result = db.prepare(`
        UPDATE cars SET status='sold', soldDate=datetime('now') WHERE id=?
    `).run(id);

    res.json({ updated: result.changes });
});

// RESTORE CAR
app.post('/api/restore', (req, res) => {
    const { id } = req.body;

    const result = db.prepare(`
        UPDATE cars SET status='available', soldDate=NULL WHERE id=?
    `).run(id);

    res.json({ success: true, updated: result.changes });
});

// =======================
// ENQUIRIES
// =======================

app.post('/api/enquiries', (req, res) => {
    let { userId, carId, name, phone, email, message } = req.body;

    if (!name) return res.status(400).json({ error: "Name required" });

    const stmt = db.prepare(`
        INSERT INTO enquiries (userId, carId, name, phone, email, message)
        VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(userId || null, carId || null, name, phone || null, email || null, message);

    res.json({ success: true, id: result.lastInsertRowid });
});

app.get('/api/enquiries', (req, res) => {
    const rows = db.prepare(`
        SELECT e.*, c.make, c.model
        FROM enquiries e
        LEFT JOIN cars c ON e.carId = c.id
        ORDER BY e.createdAt DESC
    `).all();

    res.json(rows);
});

app.delete('/api/enquiries/:id', (req, res) => {
    const result = db.prepare("DELETE FROM enquiries WHERE id=?").run(req.params.id);
    res.json({ success: true, deleted: result.changes });
});

app.put('/api/enquiries/:id/replied', (req, res) => {
    const result = db.prepare(`
        UPDATE enquiries
        SET status='replied', repliedAt=datetime('now')
        WHERE id=?
    `).run(req.params.id);

    res.json({ success: true, updated: result.changes });
});

// =======================
// ANALYTICS
// =======================

app.get('/api/analytics/top-cars', (req, res) => {
    const rows = db.prepare(`
        SELECT c.id, c.make, c.model, COUNT(e.id) as total
        FROM enquiries e
        LEFT JOIN cars c ON e.carId = c.id
        GROUP BY e.carId
        ORDER BY total DESC
        LIMIT 5
    `).all();

    res.json(rows);
});

app.get('/api/analytics/enquiries-per-day', (req, res) => {
    const rows = db.prepare(`
        SELECT DATE(createdAt) as date, COUNT(*) as total
        FROM enquiries
        GROUP BY DATE(createdAt)
        ORDER BY date ASC
    `).all();

    res.json(rows);
});

app.get('/api/analytics/conversion', (req, res) => {
    const enquiries = db.prepare("SELECT COUNT(*) as count FROM enquiries").get().count;
    const sold = db.prepare("SELECT COUNT(*) as count FROM cars WHERE status='sold'").get().count;

    const rate = enquiries ? ((sold / enquiries) * 100).toFixed(1) : 0;

    res.json({ enquiries, sold, conversionRate: rate });
});

// =======================
// 404
// =======================
app.use((req, res) => {
    res.status(404).json({ error: "Route not found" });
});

// =======================
// START SERVER
// =======================
app.listen(PORT, () => {
    console.log(`🚗 Server running on port ${PORT}`);
});