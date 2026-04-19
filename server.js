const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// =======================
// MIDDLEWARE
// =======================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

app.use((req, res, next) => {
    console.log(`📡 ${req.method} ${req.url}`);
    next();
});

// =======================
// SERVE FRONTEND
// =======================
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// =======================
// SIMPLE JSON DATABASE
// =======================
const DB_FILE = path.join(__dirname, 'db.json');

// ensure db exists
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ cars: [], enquiries: [] }, null, 2));
}

function readDB() {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
}

function writeDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// =======================
// ROUTES
// =======================

// ROOT
app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// =======================
// CARS
// =======================

// GET ALL CARS
app.get('/api/cars', (req, res) => {
    const db = readDB();
    const cars = db.cars.filter(c => c.status === 'available');
    res.json(cars);
});

// ADD CAR
app.post('/api/cars', (req, res) => {
    const db = readDB();

    const newCar = {
        id: Date.now(),
        ...req.body,
        status: 'available',
        createdAt: new Date().toISOString()
    };

    db.cars.push(newCar);
    writeDB(db);

    res.json({ success: true, id: newCar.id });
});

// GET ONE CAR
app.get('/api/cars/:id', (req, res) => {
    const db = readDB();
    const car = db.cars.find(c => c.id == req.params.id);

    if (!car) return res.status(404).json({ error: "Not found" });

    res.json(car);
});

// UPDATE CAR
app.put('/api/cars/:id', (req, res) => {
    const db = readDB();

    const index = db.cars.findIndex(c => c.id == req.params.id);

    if (index === -1) {
        return res.status(404).json({ error: "Not found" });
    }

    db.cars[index] = { ...db.cars[index], ...req.body };

    writeDB(db);

    res.json({ success: true });
});

// DELETE CAR
app.delete('/api/cars/:id', (req, res) => {
    const db = readDB();

    db.cars = db.cars.filter(c => c.id != req.params.id);

    writeDB(db);

    res.json({ success: true });
});

// SELL CAR
app.post('/api/sell', (req, res) => {
    const db = readDB();

    const car = db.cars.find(c => c.id == req.body.id);
    if (!car) return res.status(404).json({ error: "Not found" });

    car.status = 'sold';
    car.soldDate = new Date().toISOString();

    writeDB(db);

    res.json({ success: true });
});

// RESTORE CAR
app.post('/api/restore', (req, res) => {
    const db = readDB();

    const car = db.cars.find(c => c.id == req.body.id);
    if (!car) return res.status(404).json({ error: "Not found" });

    car.status = 'available';
    car.soldDate = null;

    writeDB(db);

    res.json({ success: true });
});

// =======================
// ENQUIRIES
// =======================

// ADD ENQUIRY
app.post('/api/enquiries', (req, res) => {
    const db = readDB();

    const enquiry = {
        id: Date.now(),
        ...req.body,
        status: 'new',
        createdAt: new Date().toISOString()
    };

    db.enquiries.push(enquiry);
    writeDB(db);

    res.json({ success: true, id: enquiry.id });
});

// GET ENQUIRIES
app.get('/api/enquiries', (req, res) => {
    const db = readDB();
    res.json(db.enquiries);
});

// DELETE ENQUIRY
app.delete('/api/enquiries/:id', (req, res) => {
    const db = readDB();

    db.enquiries = db.enquiries.filter(e => e.id != req.params.id);

    writeDB(db);

    res.json({ success: true });
});

// MARK AS REPLIED
app.put('/api/enquiries/:id/replied', (req, res) => {
    const db = readDB();

    const enquiry = db.enquiries.find(e => e.id == req.params.id);
    if (!enquiry) return res.status(404).json({ error: "Not found" });

    enquiry.status = 'replied';
    enquiry.repliedAt = new Date().toISOString();

    writeDB(db);

    res.json({ success: true });
});

// =======================
// ANALYTICS
// =======================

app.get('/api/analytics/top-cars', (req, res) => {
    const db = readDB();

    const stats = {};

    db.enquiries.forEach(e => {
        if (e.carId) {
            stats[e.carId] = (stats[e.carId] || 0) + 1;
        }
    });

    const result = Object.keys(stats).map(id => {
        const car = db.cars.find(c => c.id == id);
        return {
            id,
            make: car?.make,
            model: car?.model,
            total: stats[id]
        };
    });

    res.json(result.sort((a, b) => b.total - a.total).slice(0, 5));
});

app.get('/api/analytics/enquiries-per-day', (req, res) => {
    const db = readDB();

    const map = {};

    db.enquiries.forEach(e => {
        const date = new Date(e.createdAt).toISOString().split('T')[0];
        map[date] = (map[date] || 0) + 1;
    });

    const result = Object.keys(map).map(date => ({
        date,
        total: map[date]
    }));

    res.json(result);
});

app.get('/api/analytics/conversion', (req, res) => {
    const db = readDB();

    const enquiries = db.enquiries.length;
    const sold = db.cars.filter(c => c.status === 'sold').length;

    const rate = enquiries ? ((sold / enquiries) * 100).toFixed(1) : 0;

    res.json({
        enquiries,
        sold,
        conversionRate: rate
    });
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