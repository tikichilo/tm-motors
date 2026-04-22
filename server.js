const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

const JWT_SECRET = process.env.JWT_SECRET || "tmmotors_super_secret_2026_10178";
const MONGO_URI  = process.env.MONGO_URI  || "mongodb+srv://tmmotors:BigBenz%409chilo@cluster0.3yjpjxy.mongodb.net/tmmotors?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB connected'))
    .catch(err => { console.error('❌ MongoDB error:', err.message); process.exit(1); });

const carSchema = new mongoose.Schema({
    make: String, model: String, year: Number, price: Number,
    mileage: Number, color: String, description: String, image: String,
    status: { type: String, default: 'available' },
    soldDate: String,
    createdAt: { type: String, default: () => new Date().toISOString() }
});

const userSchema = new mongoose.Schema({
    firstName: String, lastName: String, phone: String,
    email: { type: String, unique: true },
    province: String, password: String,
    role: { type: String, default: 'user' },
    createdAt: { type: String, default: () => new Date().toISOString() }
});

const enquirySchema = new mongoose.Schema({
    name: String, phone: String, email: String,
    make: String, model: String,
    carId: mongoose.Schema.Types.Mixed,
    message: String,
    status: { type: String, default: 'new' },
    createdAt: { type: String, default: () => new Date().toISOString() }
});

const Car     = mongoose.model('Car',     carSchema);
const User    = mongoose.model('User',    userSchema);
const Enquiry = mongoose.model('Enquiry', enquirySchema);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use((req, res, next) => { console.log(`📡 ${req.method} ${req.url}`); next(); });

const showroomPath = path.join(__dirname, 'public/showroom');
const adminPath    = path.join(__dirname, 'admin');

function createToken(user) {
    return jwt.sign({ id: user._id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
}

function auth(req, res, next) {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ error: "No token provided" });
    const token = header.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Token missing" });
    try { req.user = jwt.verify(token, JWT_SECRET); next(); }
    catch (err) { return res.status(401).json({ error: "Invalid or expired token" }); }
}

function adminOnly(req, res, next) {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    if (req.user.role !== "admin") return res.status(403).json({ error: "Admin access required" });
    next();
}

// ========= PAGE ROUTES — BEFORE static =========
app.get('/', (req, res) => res.sendFile(path.join(showroomPath, 'showroom-signup.html')));
app.get('/login', (req, res) => res.sendFile(path.join(showroomPath, 'showroom-login.html')));
app.get('/signup', (req, res) => res.sendFile(path.join(showroomPath, 'showroom-signup.html')));
app.get('/showroom', (req, res) => res.sendFile(path.join(showroomPath, 'index.html')));
app.get('/admin/login', (req, res) => res.sendFile(path.join(adminPath, 'dashboard-login.html')));
app.get('/admin/signup', (req, res) => res.sendFile(path.join(adminPath, 'dashboard-signup.html')));
app.get('/admin/dashboard', (req, res) => res.sendFile(path.join(adminPath, 'dashboard.html')));
app.get('/admin/enquiries', (req, res) => res.sendFile(path.join(adminPath, 'que.html')));

// ========= AUTH ROUTES =========
app.post('/api/signup', async (req, res) => {
    try {
        const { firstName, lastName, phone, email, province, password, role } = req.body;
        if (!email || !password) return res.status(400).json({ error: "Email and password required" });
        const exists = await User.findOne({ email });
        if (exists) return res.status(400).json({ error: "User already exists" });
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ firstName, lastName, phone, email, province, password: hashedPassword, role: role === "admin" ? "admin" : "user" });
        await user.save();
        res.json({ success: true });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error during signup" }); }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(401).json({ error: "Invalid credentials" });
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ error: "Invalid credentials" });
        const token = createToken(user);
        res.json({ success: true, token, user: { id: user._id, email: user.email, role: user.role, firstName: user.firstName || '', lastName: user.lastName || '', phone: user.phone || '' } });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error during login" }); }
});

// ========= CAR ROUTES =========
app.get('/api/cars', auth, async (req, res) => {
    try {
        const cars = await Car.find({ status: 'available' }).sort({ createdAt: -1 });
        res.json(cars.map(c => ({ ...c.toObject(), id: c._id })));
    } catch (err) { res.status(500).json({ error: "Failed to fetch cars" }); }
});

app.get('/api/sold', auth, async (req, res) => {
    try {
        const cars = await Car.find({ status: 'sold' }).sort({ soldDate: -1 });
        res.json(cars.map(c => ({ ...c.toObject(), id: c._id })));
    } catch (err) { res.status(500).json({ error: "Failed to fetch sold cars" }); }
});

app.get('/api/cars/:id', auth, async (req, res) => {
    try {
        const car = await Car.findById(req.params.id);
        if (!car) return res.status(404).json({ error: "Car not found" });
        res.json({ ...car.toObject(), id: car._id });
    } catch (err) { res.status(500).json({ error: "Failed to fetch car" }); }
});

app.post('/api/cars', auth, adminOnly, async (req, res) => {
    try {
        const car = new Car({ ...req.body, status: 'available' });
        await car.save();
        res.json({ success: true, id: car._id });
    } catch (err) { console.error(err); res.status(500).json({ error: "Failed to add car" }); }
});

app.put('/api/cars/:id', auth, adminOnly, async (req, res) => {
    try {
        const car = await Car.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!car) return res.status(404).json({ error: "Car not found" });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Failed to update car" }); }
});

app.delete('/api/cars/:id', auth, adminOnly, async (req, res) => {
    try {
        const car = await Car.findByIdAndDelete(req.params.id);
        if (!car) return res.status(404).json({ error: "Car not found" });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Failed to delete car" }); }
});

app.post('/api/sell', auth, adminOnly, async (req, res) => {
    try {
        const car = await Car.findByIdAndUpdate(req.body.id, { status: 'sold', soldDate: new Date().toISOString() }, { new: true });
        if (!car) return res.status(404).json({ error: "Car not found" });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Failed to mark as sold" }); }
});

app.post('/api/restore', auth, adminOnly, async (req, res) => {
    try {
        const car = await Car.findByIdAndUpdate(req.body.id, { status: 'available', $unset: { soldDate: "" } }, { new: true });
        if (!car) return res.status(404).json({ error: "Car not found" });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Failed to restore car" }); }
});

// ========= ENQUIRY ROUTES =========
app.get('/api/enquiries', auth, async (req, res) => {
    try {
        const enquiries = await Enquiry.find().sort({ createdAt: -1 });
        res.json(enquiries.map(e => ({ ...e.toObject(), id: e._id })));
    } catch (err) { res.status(500).json({ error: "Failed to fetch enquiries" }); }
});

app.get('/api/enquiries/:id', auth, async (req, res) => {
    try {
        const e = await Enquiry.findById(req.params.id);
        if (!e) return res.status(404).json({ error: "Not found" });
        res.json({ ...e.toObject(), id: e._id });
    } catch (err) { res.status(500).json({ error: "Failed to fetch enquiry" }); }
});

app.post('/api/enquiries', auth, async (req, res) => {
    try {
        const enquiry = new Enquiry({ ...req.body, status: 'new' });
        await enquiry.save();
        res.json({ success: true, id: enquiry._id });
    } catch (err) { console.error(err); res.status(500).json({ error: "Failed to save enquiry" }); }
});

app.put('/api/enquiries/:id/read', auth, async (req, res) => {
    try {
        const e = await Enquiry.findById(req.params.id);
        if (!e) return res.status(404).json({ error: "Not found" });
        if (e.status === 'new') { e.status = 'read'; await e.save(); }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Failed to update enquiry" }); }
});

app.put('/api/enquiries/:id/replied', auth, async (req, res) => {
    try {
        const e = await Enquiry.findByIdAndUpdate(req.params.id, { status: 'replied' }, { new: true });
        if (!e) return res.status(404).json({ error: "Not found" });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Failed to update enquiry" }); }
});

app.delete('/api/enquiries/:id', auth, async (req, res) => {
    try {
        const e = await Enquiry.findByIdAndDelete(req.params.id);
        if (!e) return res.status(404).json({ error: "Not found" });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Failed to delete enquiry" }); }
});

// ========= STATIC FILES — after page routes =========
app.use('/admin', express.static(adminPath));
app.use(express.static(showroomPath));

// ========= DEBUG =========
app.get('/test-token', (req, res) => {
    res.json({ message: "Server OK", db: mongoose.connection.readyState === 1 ? "connected" : "disconnected" });
});

// ========= 404 — must be LAST =========
app.use((req, res) => res.status(404).send("Page not found"));

app.listen(PORT, () => console.log(`🚗 T&M Motors server running on port ${PORT}`));