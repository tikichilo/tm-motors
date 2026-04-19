const express = require('express');
const sqlite3 = require('sqlite3').verbose();
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

// 🔥 LOG EVERY REQUEST
app.use((req, res, next) => {
    console.log(`📡 ${req.method} ${req.url}`);
    next();
});

// =======================
// SERVE FRONTEND (IMPORTANT)
// =======================
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// =======================
// DATABASE
// =======================
const db = new sqlite3.Database('./cars.db', (err) => {
    if (err) {
        console.error('❌ Database connection failed:', err.message);
        process.exit(1);
    } else {
        console.log('✅ Connected to SQLite database');
    }
});

// =======================
// CREATE TABLES
// =======================
db.serialize(() => {

    db.run(`
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
    `);

    db.run(`
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
    `);

});

// =======================
// ROOT ROUTE
// =======================
app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// =======================
// SAFE PAGE ROUTER (FIX FOR DEPLOYMENT)
// =======================
app.get('/:page', (req, res, next) => {
    const file = path.join(publicPath, req.params.page);

    res.sendFile(file, (err) => {
        if (err) next();
    });
});

// =======================
// VALIDATION
// =======================
function isValidId(id) {
    return !isNaN(parseInt(id)) && parseInt(id) > 0;
}

// =======================
// CAR ROUTES
// =======================

// ADD CAR
app.post('/api/cars', (req, res) => {
    const { make, model, year, price, mileage, color, description, image } = req.body;

    if (!make || !model || !price) {
        return res.status(400).json({ error: "Make, model, and price required" });
    }

    db.run(
        `INSERT INTO cars (make, model, year, price, mileage, color, description, image, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'available')`,
        [make, model, year, price, mileage, color, description, image],
        function (err) {
            if (err) {
                console.error(err.message);
                return res.status(500).json({ error: "Failed to add car" });
            }

            res.json({ success: true, id: this.lastID });
        }
    );
});

// GET CARS
app.get('/api/cars', (req, res) => {
    db.all(`SELECT * FROM cars WHERE status='available' ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: "Failed to fetch cars" });
        res.json(rows);
    });
});

// GET SINGLE CAR
app.get('/api/cars/:id', (req, res) => {
    db.get(`SELECT * FROM cars WHERE id=?`, [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: "Failed" });
        if (!row) return res.status(404).json({ error: "Not found" });
        res.json(row);
    });
});

// UPDATE CAR
app.put('/api/cars/:id', (req, res) => {
    const { make, model, year, price, mileage, color, description, image } = req.body;

    db.run(
        `UPDATE cars SET make=?, model=?, year=?, price=?, mileage=?, color=?, description=?, image=? WHERE id=?`,
        [make, model, year, price, mileage, color, description, image, req.params.id],
        function (err) {
            if (err) return res.status(500).json({ error: "Update failed" });
            res.json({ updated: this.changes });
        }
    );
});

// DELETE CAR
app.delete('/api/cars/:id', (req, res) => {
    db.run(`DELETE FROM cars WHERE id=?`, [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: "Delete failed" });
        res.json({ deleted: this.changes });
    });
});

// SELL CAR
app.post('/api/sell', (req, res) => {
    const { id } = req.body;

    db.run(
        `UPDATE cars SET status='sold', soldDate=datetime('now') WHERE id=?`,
        [id],
        function (err) {
            if (err) return res.status(500).json({ error: "Sell failed" });
            res.json({ updated: this.changes });
        }
    );
});

// RESTORE CAR
app.post('/api/restore', (req, res) => {
    const { id } = req.body;

    db.run(
        `UPDATE cars SET status='available', soldDate=NULL WHERE id=?`,
        [id],
        function (err) {
            if (err) return res.status(500).json({ error: "Restore failed" });
            res.json({ success: true });
        }
    );
});

// =======================
// ENQUIRIES
// =======================

app.post('/api/enquiries', (req, res) => {
    let { userId, carId, name, phone, email, message } = req.body;

    if (!name) return res.status(400).json({ error: "Name required" });

    db.run(
        `INSERT INTO enquiries (userId, carId, name, phone, email, message)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [userId || null, carId || null, name, phone || null, email || null, message],
        function (err) {
            if (err) return res.status(500).json({ error: "Failed enquiry" });
            res.json({ success: true, id: this.lastID });
        }
    );
});

app.get('/api/enquiries', (req, res) => {
    db.all(`
        SELECT e.*, c.make, c.model
        FROM enquiries e
        LEFT JOIN cars c ON e.carId = c.id
        ORDER BY e.createdAt DESC
    `, [], (err, rows) => {
        if (err) return res.status(500).json({ error: "Failed" });
        res.json(rows);
    });
});

app.delete('/api/enquiries/:id', (req, res) => {
    db.run(`DELETE FROM enquiries WHERE id=?`, [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: "Delete failed" });
        res.json({ success: true });
    });
});

app.put('/api/enquiries/:id/replied', (req, res) => {
    db.run(
        `UPDATE enquiries SET status='replied', repliedAt=datetime('now') WHERE id=?`,
        [req.params.id],
        function (err) {
            if (err) return res.status(500).json({ error: "Update failed" });
            res.json({ success: true });
        }
    );
});

// =======================
// ANALYTICS (UNCHANGED)
// =======================
app.get('/api/analytics/top-cars', (req, res) => {
    db.all(`
        SELECT c.id, c.make, c.model, COUNT(e.id) as total
        FROM enquiries e
        LEFT JOIN cars c ON e.carId = c.id
        GROUP BY e.carId
        ORDER BY total DESC
        LIMIT 5
    `, [], (err, rows) => {
        if (err) return res.status(500).json({ error: "Failed" });
        res.json(rows);
    });
});

app.get('/api/analytics/enquiries-per-day', (req, res) => {
    db.all(`
        SELECT DATE(createdAt) as date, COUNT(*) as total
        FROM enquiries
        GROUP BY DATE(createdAt)
        ORDER BY date ASC
    `, [], (err, rows) => {
        if (err) return res.status(500).json({ error: "Failed" });
        res.json(rows);
    });
});

app.get('/api/analytics/conversion', (req, res) => {
    db.get(`
        SELECT 
            (SELECT COUNT(*) FROM enquiries) as enquiries,
            (SELECT COUNT(*) FROM cars WHERE status='sold') as sold
    `, [], (err, row) => {
        if (err) return res.status(500).json({ error: "Failed" });

        const rate = row.enquiries
            ? ((row.sold / row.enquiries) * 100).toFixed(1)
            : 0;

        res.json({ ...row, conversionRate: rate });
    });
});

// =======================
// 404
// =======================
app.use((req, res) => {
    res.status(404).json({ error: "Route not found" });
});

// =======================
// START
// =======================
app.listen(PORT, () => {
    console.log(`🚗 Server running on port ${PORT}`);
});