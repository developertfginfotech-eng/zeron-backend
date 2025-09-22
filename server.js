const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const kycRoutes = require('./routes/kyc');
const userRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin'); 
const propertyRoutes = require('./routes/properties'); 

// Import middleware
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');

const app = express();

// Security middleware
app.use(helmet());

const allowedOrigins = [
  'http://13.53.177.188:3000',   
  'http://localhost:3000'
];

app.use(cors({
  origin: function(origin, callback){
    if (!origin) return callback(null, true); 
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(mongoSanitize());

// ADD THIS: Serve static files for uploads
app.use('/uploads', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static('uploads'));


const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Body parsing - SUPPORT BOTH JSON AND FORM-DATA
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // This handles form-data

// Logging
app.use(morgan('combined', { 
  stream: { write: message => logger.info(message.trim()) } 
}));

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/kyc', kycRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/properties', propertyRoutes); 

// Error handling
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found'
  });
});

app.use(errorHandler);

// Database connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  logger.info('MongoDB connected');
  createDefaultAdmin();
})
.catch((error) => {
  logger.error('MongoDB connection error:', error);
  process.exit(1);
});

// Create default admin user
async function createDefaultAdmin() {
  try {
    const User = require('./models/User');
    const adminExists = await User.findOne({ role: 'super_admin' });
    
    if (!adminExists) {
      const admin = new User({
        email: process.env.ADMIN_EMAIL ,
        phone: '+966500000000',
        password: process.env.ADMIN_PASSWORD ,
        firstName: 'Super',
        lastName: 'Admin',
        role: 'super_admin',
        kycStatus: 'approved',
        status: 'active'
      });
      
      await admin.save();
      logger.info('Default admin user created');
    }
  } catch (error) {
    logger.error('Error creating admin:', error);
  }
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
});