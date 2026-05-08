require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const cloudinary = require('cloudinary').v2;
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

//
// =======================
// ENV VALIDATION
// =======================
//

const requiredEnv = [
    'MONGO_URI',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
    'EMAIL_USER',
    'EMAIL_PASS',
    'NOTIFY_EMAIL'
];

requiredEnv.forEach((key) => {
    if (!process.env[key]) {
        console.error(`❌ Missing ENV: ${key}`);
        process.exit(1);
    }
});

//
// =======================
// MIDDLEWARE
// =======================
//

app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

app.use(cors({
    origin: process.env.CLIENT_URL || '*'
}));

app.use(compression());

app.use(express.json({
    limit: '50mb'
}));

app.use(express.urlencoded({
    extended: true,
    limit: '10mb'
}));

app.use(morgan('combined'));

//
// =======================
// RATE LIMITER
// =======================
//

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: {
        error: 'Too many requests, please try again later.'
    }
});

app.use('/api', apiLimiter);

//
// =======================
// CLOUDINARY
// =======================
//

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

//
// =======================
// MAILER
// Using Gmail SMTP with an App Password.
// Setup steps:
//   1. Create a Gmail account e.g. tmmotorz@gmail.com
//   2. Enable 2-Step Verification on that Google account
//   3. Go to Google Account → Security → App passwords
//   4. Generate an App Password for "Mail"
//   5. In Render set:
//        EMAIL_USER  = tmmotorz@gmail.com
//        EMAIL_PASS  = the 16-char app password (no spaces)
//        NOTIFY_EMAIL = tmmotorz@outlook.com  ← where you want to RECEIVE alerts
// =======================
//

async function sendNotification(subject, html) {
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        await transporter.sendMail({
            from: `"T&M Motors" <${process.env.EMAIL_USER}>`,
            to: process.env.NOTIFY_EMAIL,
            subject,
            html
        });

        console.log('✅ Email sent:', subject);

    } catch (err) {
        console.error('❌ Email failed (non-fatal):', err.message);
    }
}

//
// =======================
// DATABASE
// =======================
//

mongoose.connect(process.env.MONGO_URI);

mongoose.connection.on('connected', () => {
    console.log('✅ MongoDB connected');
});

mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB Error:', err.message);
});

//
// =======================
// SCHEMAS
// =======================
//

const carSchema = new mongoose.Schema({
    make: {
        type: String,
        required: true,
        trim: true
    },

    model: {
        type: String,
        required: true,
        trim: true
    },

    year: {
        type: Number,
        min: 1900,
        max: 2100
    },

    price: {
        type: Number,
        required: true,
        min: 0
    },

    mileage: {
        type: Number,
        min: 0
    },

    color: String,

    description: {
        type: String,
        maxlength: 5000
    },

    image: String,

    images: {
        type: [String],
        default: []
    },

    status: {
        type: String,
        enum: ['available', 'sold', 'reserved'],
        default: 'available'
    }

}, {
    timestamps: true
});

carSchema.index({
    make: 1,
    model: 1
});

const enquirySchema = new mongoose.Schema({

    carId: mongoose.Schema.Types.ObjectId,

    carMake: String,

    carModel: String,

    carYear: Number,

    name: {
        type: String,
        required: true,
        trim: true
    },

    phone: String,

    email: {
        type: String,
        lowercase: true
    },

    message: {
        type: String,
        maxlength: 3000
    },

    status: {
        type: String,
        enum: ['new', 'contacted', 'closed'],
        default: 'new'
    }

}, {
    timestamps: true
});

const preOrderSchema = new mongoose.Schema({

    name: {
        type: String,
        required: true
    },

    phone: String,

    email: String,

    make: {
        type: String,
        required: true
    },

    model: {
        type: String,
        required: true
    },

    year: String,

    spec: String,

    transmission: String,

    color1: String,

    color2: String,

    budget: String,

    extraNotes: String,

    status: {
        type: String,
        default: 'new'
    }

}, {
    timestamps: true
});

//
// =======================
// MODELS
// =======================
//

const Car = mongoose.model('Car', carSchema);
const Enquiry = mongoose.model('Enquiry', enquirySchema);
const PreOrder = mongoose.model('PreOrder', preOrderSchema);

//
// =======================
// HELPERS
// =======================
//

function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next))
            .catch(next);
    };
}

function carOut(car) {
    return {
        id: car._id,
        make: car.make,
        model: car.model,
        year: car.year,
        price: car.price,
        mileage: car.mileage,
        color: car.color,
        description: car.description,
        image: car.image,
        images: car.images?.length
            ? car.images
            : [car.image],
        status: car.status,
        createdAt: car.createdAt
    };
}

//
// =======================
// HEALTH CHECK
// =======================
//

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime()
    });
});

//
// =======================
// GET CARS
// =======================
//

app.get('/api/v1/cars', asyncHandler(async (req, res) => {

    const cars = await Car.find({
        status: 'available'
    }).sort({
        createdAt: -1
    });

    res.json(cars.map(car => ({
        id: car._id.toString(),
        make: car.make,
        model: car.model,
        year: car.year,
        price: car.price || 0,
        mileage: car.mileage || 0,
        color: car.color || '',
        description: car.description || '',
        image: car.image || '',
        images: Array.isArray(car.images) && car.images.length
            ? car.images
            : (car.image ? [car.image] : []),
        status: car.status || 'available',
        createdAt: car.createdAt
    })));

}));

//
// =======================
// GET SINGLE CAR
// =======================
//

app.get('/api/v1/cars/:id', asyncHandler(async (req, res) => {

    const car = await Car.findById(req.params.id);

    if (!car) {
        return res.status(404).json({
            error: 'Car not found'
        });
    }

    res.json(carOut(car));

}));

//
// =======================
// CREATE ENQUIRY
// =======================
//

app.post('/api/v1/enquiries', asyncHandler(async (req, res) => {

    const enquiry = await Enquiry.create(req.body);

    // Respond to client immediately — success popup shows, overlay closes
    res.status(201).json({
        success: true,
        id: enquiry._id
    });

    // Send email in background — never blocks the client response
    void sendNotification(
        '🚗 New Enquiry — T&M Motors',
        `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
          <div style="background:#1a1a2e;padding:24px;text-align:center;">
            <h1 style="color:#ffffff;margin:0;font-size:22px;">🚗 T&M Motors</h1>
            <p style="color:#aaa;margin:6px 0 0;">New Enquiry Received</p>
          </div>
          <div style="padding:24px;">
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;color:#888;width:120px;">👤 Name</td>
                <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-weight:bold;">${enquiry.name}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;color:#888;">📞 Phone</td>
                <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;">${enquiry.phone || 'Not provided'}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;color:#888;">✉️ Email</td>
                <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;">${enquiry.email || 'Not provided'}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;color:#888;">🚘 Car</td>
                <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;">${enquiry.carMake || ''} ${enquiry.carModel || ''}${enquiry.carYear ? ' (' + enquiry.carYear + ')' : ''}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;color:#888;vertical-align:top;">💬 Message</td>
                <td style="padding:10px 0;">${enquiry.message || 'No message provided'}</td>
              </tr>
            </table>
          </div>
          <div style="background:#f9f9f9;padding:16px;text-align:center;color:#aaa;font-size:12px;">
            T&M Motors • Auto-notification from your website
          </div>
        </div>
        `
    );

}));

//
// =======================
// CREATE PRE-ORDER
// =======================
//

app.post('/api/v1/preorders', asyncHandler(async (req, res) => {

    const preOrder = await PreOrder.create(req.body);

    // Respond to client immediately
    res.status(201).json({
        success: true,
        id: preOrder._id
    });

    // Send email in background
    void sendNotification(
        '✨ New Pre-Order Request — T&M Motors',
        `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
          <div style="background:#1a1a2e;padding:24px;text-align:center;">
            <h1 style="color:#ffffff;margin:0;font-size:22px;">✨ T&M Motors</h1>
            <p style="color:#aaa;margin:6px 0 0;">New Pre-Order Request</p>
          </div>
          <div style="padding:24px;">
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;color:#888;width:140px;">👤 Name</td>
                <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-weight:bold;">${preOrder.name}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;color:#888;">📞 Phone</td>
                <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;">${preOrder.phone || 'Not provided'}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;color:#888;">✉️ Email</td>
                <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;">${preOrder.email || 'Not provided'}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;color:#888;">🚘 Car</td>
                <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;">${preOrder.make} ${preOrder.model}${preOrder.year ? ' (' + preOrder.year + ')' : ''}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;color:#888;">⚙️ Spec</td>
                <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;">${preOrder.spec || 'No preference'}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;color:#888;">🔧 Transmission</td>
                <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;">${preOrder.transmission || 'No preference'}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;color:#888;">🎨 Colours</td>
                <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;">${[preOrder.color1, preOrder.color2].filter(Boolean).join(' / ') || 'Not specified'}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;color:#888;">💰 Budget</td>
                <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;">${preOrder.budget ? 'K ' + preOrder.budget : 'Not specified'}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;color:#888;vertical-align:top;">📝 Notes</td>
                <td style="padding:10px 0;">${preOrder.extraNotes || 'None'}</td>
              </tr>
            </table>
          </div>
          <div style="background:#f9f9f9;padding:16px;text-align:center;color:#aaa;font-size:12px;">
            T&M Motors • Auto-notification from your website
          </div>
        </div>
        `
    );

}));

//
// =======================
// CLOUDINARY IMAGE UPLOAD
// =======================
//

app.post('/api/v1/upload', asyncHandler(async (req, res) => {

    const { image } = req.body;

    if (!image) {
        return res.status(400).json({
            error: 'Image required'
        });
    }

    const upload = await cloudinary.uploader.upload(image, {
        folder: 'tm-motors'
    });

    res.json({
        url: upload.secure_url
    });

}));

//
// =======================
// STATIC FILES
// =======================
//

app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

//
// =======================
// GLOBAL ERROR HANDLER
// =======================
//

app.use((err, req, res, next) => {
    console.error('ROUTE ERROR:', err);
    res.status(err.status || 500).json({
        error: process.env.NODE_ENV === 'production'
            ? 'Internal server error'
            : err.message
    });
});

//
// =======================
// GRACEFUL SHUTDOWN
// =======================
//

process.on('SIGINT', async () => {
    console.log('🛑 Shutting down...');
    await mongoose.connection.close();
    process.exit(0);
});

//
// =======================
// START SERVER
// =======================
//

app.listen(PORT, () => {
    console.log(`🚗 T&M Motors server running on port ${PORT}`);
});