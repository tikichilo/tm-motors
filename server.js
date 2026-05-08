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
    'EMAIL_PASS'
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
    limit: '50mb'
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
// =======================
//

const transporter = nodemailer.createTransport({
    service: 'hotmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

async function sendNotification(subject, html) {
    try {
        await transporter.sendMail({
            from: `"T&M Motors" <${process.env.EMAIL_USER}>`,
            to: process.env.EMAIL_USER,
            subject,
            html
        });
    } catch (err) {
        // Log but don't crash the request if email fails
        console.error('❌ Email send failed:', err.message);
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

    await sendNotification(
        '🚗 New Enquiry — T&M Motors',
        `<h2>New Enquiry Received</h2>
         <p><strong>Name:</strong> ${enquiry.name}</p>
         <p><strong>Phone:</strong> ${enquiry.phone || 'Not provided'}</p>
         <p><strong>Email:</strong> ${enquiry.email || 'Not provided'}</p>
         <p><strong>Car:</strong> ${enquiry.carMake || ''} ${enquiry.carModel || ''}${enquiry.carYear ? ' (' + enquiry.carYear + ')' : ''}</p>
         <p><strong>Message:</strong> ${enquiry.message || 'No message'}</p>`
    );

    res.status(201).json({
        success: true,
        id: enquiry._id
    });

}));

//
// =======================
// CREATE PRE-ORDER
// =======================
//

app.post('/api/v1/preorders', asyncHandler(async (req, res) => {

    const preOrder = await PreOrder.create(req.body);

    await sendNotification(
        '✨ New Pre-Order Request — T&M Motors',
        `<h2>New Pre-Order Received</h2>
         <p><strong>Name:</strong> ${preOrder.name}</p>
         <p><strong>Phone:</strong> ${preOrder.phone || 'Not provided'}</p>
         <p><strong>Email:</strong> ${preOrder.email || 'Not provided'}</p>
         <p><strong>Car:</strong> ${preOrder.make} ${preOrder.model}${preOrder.year ? ' (' + preOrder.year + ')' : ''}</p>
         <p><strong>Spec:</strong> ${preOrder.spec || 'No preference'}</p>
         <p><strong>Transmission:</strong> ${preOrder.transmission || 'No preference'}</p>
         <p><strong>Colours:</strong> ${[preOrder.color1, preOrder.color2].filter(Boolean).join(' / ') || 'Not specified'}</p>
         <p><strong>Budget:</strong> ${preOrder.budget ? 'K ' + preOrder.budget : 'Not specified'}</p>
         <p><strong>Extra Notes:</strong> ${preOrder.extraNotes || 'None'}</p>`
    );

    res.status(201).json({
        success: true,
        id: preOrder._id
    });

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
        error: err.message  // ← always show real error for now
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
