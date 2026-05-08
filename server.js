require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const mongoose   = require('mongoose');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const morgan     = require('morgan');
const nodemailer = require('nodemailer');
const cloudinary = require('cloudinary').v2;

const app  = express();
const PORT = process.env.PORT || 3000;

// =======================
// ENV CHECKS
// =======================
if (!process.env.MONGO_URI) {
    console.error("❌ Missing MONGO_URI");
    process.exit(1);
}
if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    console.error("❌ Missing Cloudinary env vars");
    process.exit(1);
}
if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error("❌ Missing EMAIL_USER or EMAIL_PASS in .env");
    process.exit(1);
}

// =======================
// CLOUDINARY CONFIG
// =======================
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// =======================
// MAILER CONFIG
// =======================
const transporter = nodemailer.createTransport({
    host:   'smtp-mail.outlook.com',
    port:   587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
    tls: { ciphers: 'SSLv3' }
});

async function sendNotification(subject, htmlBody) {
    try {
        await transporter.sendMail({
            from:    `"T&M Motors" <${process.env.EMAIL_USER}>`,
            to:      process.env.EMAIL_USER,
            subject: subject,
            html:    htmlBody,
        });
        console.log(`📧 Notification sent: ${subject}`);
    } catch (err) {
        console.error('⚠️ Email notification failed:', err.message);
    }
}

// =======================
// TRUST PROXY
// =======================
app.set('trust proxy', 1);

// =======================
// MIDDLEWARE
// =======================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: true, credentials: true }));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('dev'));

// =======================
// RATE LIMITERS
// =======================
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }));

// =======================
// DATABASE
// =======================
mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS:          45000,
    maxPoolSize:              10,
    heartbeatFrequencyMS:     10000,
})
.then(() => console.log('✅ MongoDB connected'))
.catch(err => { console.error('❌ MongoDB error:', err.message); process.exit(1); });

mongoose.connection.on('disconnected', () => console.warn('⚠️ MongoDB disconnected. Reconnecting...'));
mongoose.connection.on('reconnected',  () => console.log('✅ MongoDB reconnected'));
mongoose.connection.on('error',        (err) => console.error('❌ MongoDB error:', err.message));

// =======================
// SCHEMAS
// =======================
const carSchema = new mongoose.Schema({
    make:        { type: String, required: true },
    model:       { type: String, required: true },
    year:        Number,
    price:       { type: Number, required: true },
    mileage:     Number,
    color:       String,
    description: String,
    image:       String,
    images:      [String],
    status:      { type: String, default: 'available' },
    soldDate:    String,
    createdAt:   { type: String, default: () => new Date().toISOString() }
});

const enquirySchema = new mongoose.Schema({
    carId:     { type: String, default: null },
    carMake:   String,
    carModel:  String,
    carYear:   Number,
    name:      { type: String, required: true },
    phone:     String,
    email:     String,
    message:   String,
    status:    { type: String, default: 'new' },
    repliedAt: String,
    createdAt: { type: String, default: () => new Date().toISOString() }
});

const preOrderSchema = new mongoose.Schema({
    name:         { type: String, required: true },
    phone:        String,
    email:        String,
    make:         { type: String, required: true },
    model:        { type: String, required: true },
    year:         String,
    spec:         String,
    transmission: String,
    color1:       String,
    color2:       String,
    budget:       String,
    extraNotes:   String,
    status:       { type: String, default: 'new' },
    createdAt:    { type: String, default: () => new Date().toISOString() }
});

const Car      = mongoose.model('Car',      carSchema);
const Enquiry  = mongoose.model('Enquiry',  enquirySchema);
const PreOrder = mongoose.model('PreOrder', preOrderSchema);

function carOut(c) {
    const obj = c.toObject();
    obj.id = obj._id.toString();
    if (!obj.images || !obj.images.length) {
        obj.images = obj.image ? [obj.image] : [];
    }
    return obj;
}

// =======================
// HEALTH CHECK
// =======================
app.get('/health', async (req, res) => {
    const state = mongoose.connection.readyState;
    if (state === 1) {
        res.status(200).json({ status: 'ok', db: 'connected' });
    } else {
        res.status(503).json({ status: 'error', db: 'disconnected' });
    }
});

// =======================
// CAR ROUTES (public)
// =======================
app.get('/api/cars', async (req, res) => {
    try {
        const cars = await Car.find({ status: 'available' }).sort({ createdAt: -1 });
        res.json(cars.map(carOut));
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch cars" });
    }
});

app.get('/api/cars/:id', async (req, res) => {
    try {
        const car = await Car.findById(req.params.id);
        if (!car) return res.status(404).json({ error: "Not found" });
        res.json(carOut(car));
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch car" });
    }
});

// =======================
// ENQUIRY ROUTE (public)
// =======================
app.post('/api/enquiries', async (req, res) => {
    try {
        const { carId, carMake, carModel, carYear, name, phone, email, message } = req.body;
        if (!name) return res.status(400).json({ error: "Name is required" });

        const enquiry = await new Enquiry({
            carId:    carId    || null,
            carMake:  carMake  || null,
            carModel: carModel || null,
            carYear:  carYear  || null,
            name,
            phone:   phone   || null,
            email:   email   || null,
            message: message || null,
            status:  'new'
        }).save();

        // 🔔 EMAIL NOTIFICATION
        await sendNotification(
            `🚗 New Enquiry from ${name}`,
            `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden">
                <div style="background:#1a1a1a;padding:24px 28px">
                    <h1 style="color:#ffffff;margin:0;font-size:20px;letter-spacing:1px">T&amp;M MOTORS</h1>
                    <p style="color:#aaaaaa;margin:4px 0 0;font-size:13px">New Customer Enquiry</p>
                </div>
                <div style="padding:28px">
                    <table style="width:100%;border-collapse:collapse;font-size:15px">
                        <tr style="border-bottom:1px solid #f0f0f0">
                            <td style="padding:10px 12px;font-weight:bold;color:#555;width:130px">Name</td>
                            <td style="padding:10px 12px;color:#111">${name}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #f0f0f0">
                            <td style="padding:10px 12px;font-weight:bold;color:#555">Phone</td>
                            <td style="padding:10px 12px;color:#111">${phone || '—'}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #f0f0f0">
                            <td style="padding:10px 12px;font-weight:bold;color:#555">Email</td>
                            <td style="padding:10px 12px;color:#111">${email || '—'}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #f0f0f0">
                            <td style="padding:10px 12px;font-weight:bold;color:#555">Car</td>
                            <td style="padding:10px 12px;color:#111">${[carYear, carMake, carModel].filter(Boolean).join(' ') || '—'}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #f0f0f0">
                            <td style="padding:10px 12px;font-weight:bold;color:#555">Message</td>
                            <td style="padding:10px 12px;color:#111">${message || '—'}</td>
                        </tr>
                        <tr>
                            <td style="padding:10px 12px;font-weight:bold;color:#555">Received</td>
                            <td style="padding:10px 12px;color:#111">${new Date().toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' })}</td>
                        </tr>
                    </table>
                </div>
                <div style="background:#f7f7f7;padding:16px 28px;font-size:12px;color:#999;text-align:center">
                    Reply promptly to this enquiry via your admin dashboard.
                </div>
            </div>
            `
        );

        res.json({ success: true, id: enquiry._id });
    } catch (err) {
        console.error('❌ ENQUIRY:', err.message);
        res.status(500).json({ error: "Failed to submit enquiry" });
    }
});

// =======================
// PRE-ORDER ROUTE (public)
// =======================
app.post('/api/preorders', async (req, res) => {
    try {
        const { name, phone, email, make, model, year, spec, transmission, color1, color2, budget, extraNotes } = req.body;
        if (!name || !make || !model) return res.status(400).json({ error: "Name, make, and model are required" });

        const order = await new PreOrder({
            name,
            phone:        phone        || null,
            email:        email        || null,
            make:         make.trim(),
            model:        model.trim(),
            year:         year         || null,
            spec:         spec         || null,
            transmission: transmission || null,
            color1:       color1       || null,
            color2:       color2       || null,
            budget:       budget       || null,
            extraNotes:   extraNotes   || null,
            status:       'new'
        }).save();

        // 🔔 EMAIL NOTIFICATION
        await sendNotification(
            `📦 New Pre-Order from ${name}`,
            `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden">
                <div style="background:#1a1a1a;padding:24px 28px">
                    <h1 style="color:#ffffff;margin:0;font-size:20px;letter-spacing:1px">T&amp;M MOTORS</h1>
                    <p style="color:#aaaaaa;margin:4px 0 0;font-size:13px">New Pre-Order Request</p>
                </div>
                <div style="padding:28px">
                    <table style="width:100%;border-collapse:collapse;font-size:15px">
                        <tr style="border-bottom:1px solid #f0f0f0">
                            <td style="padding:10px 12px;font-weight:bold;color:#555;width:130px">Name</td>
                            <td style="padding:10px 12px;color:#111">${name}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #f0f0f0">
                            <td style="padding:10px 12px;font-weight:bold;color:#555">Phone</td>
                            <td style="padding:10px 12px;color:#111">${phone || '—'}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #f0f0f0">
                            <td style="padding:10px 12px;font-weight:bold;color:#555">Email</td>
                            <td style="padding:10px 12px;color:#111">${email || '—'}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #f0f0f0">
                            <td style="padding:10px 12px;font-weight:bold;color:#555">Car Requested</td>
                            <td style="padding:10px 12px;color:#111">${[year, make, model].filter(Boolean).join(' ')}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #f0f0f0">
                            <td style="padding:10px 12px;font-weight:bold;color:#555">Spec</td>
                            <td style="padding:10px 12px;color:#111">${spec || '—'}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #f0f0f0">
                            <td style="padding:10px 12px;font-weight:bold;color:#555">Transmission</td>
                            <td style="padding:10px 12px;color:#111">${transmission || '—'}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #f0f0f0">
                            <td style="padding:10px 12px;font-weight:bold;color:#555">Colour 1</td>
                            <td style="padding:10px 12px;color:#111">${color1 || '—'}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #f0f0f0">
                            <td style="padding:10px 12px;font-weight:bold;color:#555">Colour 2</td>
                            <td style="padding:10px 12px;color:#111">${color2 || '—'}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #f0f0f0">
                            <td style="padding:10px 12px;font-weight:bold;color:#555">Budget</td>
                            <td style="padding:10px 12px;color:#111">${budget || '—'}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #f0f0f0">
                            <td style="padding:10px 12px;font-weight:bold;color:#555">Notes</td>
                            <td style="padding:10px 12px;color:#111">${extraNotes || '—'}</td>
                        </tr>
                        <tr>
                            <td style="padding:10px 12px;font-weight:bold;color:#555">Received</td>
                            <td style="padding:10px 12px;color:#111">${new Date().toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' })}</td>
                        </tr>
                    </table>
                </div>
                <div style="background:#f7f7f7;padding:16px 28px;font-size:12px;color:#999;text-align:center">
                    Review this pre-order and follow up with the customer as soon as possible.
                </div>
            </div>
            `
        );

        res.status(201).json({ success: true, id: order._id });
    } catch (err) {
        console.error('❌ PRE-ORDER:', err.message);
        res.status(500).json({ error: "Failed to submit pre-order" });
    }
});

// =======================
// SERVE PUBLIC SITE
// =======================
app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`🚗 T&M Motors public site running on http://localhost:${PORT}`));