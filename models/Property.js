const mongoose = require('mongoose');

const propertySchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },

  description: {
    type: String,
    required: true
  },

  location: {
    address: { type: String, required: false },     // optional
    addressAr: { type: String, required: false },   // optional
    city: { type: String, required: false },        // optional, remove enum restriction
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },

  propertyType: {
    type: String,
    required: true,
    enum: ['residential', 'commercial', 'retail']
  },

  seoData: {
    slug: { type: String, unique: true, sparse: true },
    slugAr: { type: String, unique: true, sparse: true },
    metaTitle: String,
    metaDescription: String
  },

  financials: {
    totalValue: { type: Number, default: 0 },
    currentValue: { type: Number, default: 0 },
    minInvestment: { type: Number, default: 1000 },
    totalShares: { type: Number, default: 0 },
    availableShares: { type: Number, default: 0 },
    pricePerShare: { type: Number, default: 0 },
    projectedYield: { type: Number, default: 0 },
    monthlyRental: { type: Number, default: 0 }
  },

  status: {
    type: String,
    enum: ['draft', 'active', 'fully_funded', 'completed', 'cancelled', 'upcoming'],
    default: 'draft'
  },

  fundingProgress: { type: Number, default: 0, min: 0, max: 100 },
  investorCount: { type: Number, default: 0 },

  features: [String],
  featuresAr: [String],

  images: [{
    url: String,
    alt: String,
    isPrimary: { type: Boolean, default: false }
  }],

  timeline: {
    launchDate: { type: Date, default: Date.now },
    fundingDeadline: { type: Date, default: () => new Date(Date.now() + 90*24*60*60*1000) } // 90 days later
  },

  // Property-specific investment settings (overrides global settings)
  investmentTerms: {
    targetReturn: { type: Number, default: 0 }, // Target return percentage
    rentalYieldRate: { type: Number, default: null }, // Annual rental yield %, null = use global setting
    appreciationRate: { type: Number, default: null }, // Annual appreciation %, null = use global setting
    lockingPeriodYears: { type: Number, default: null }, // Locking period in years, null = use global setting
    investmentDurationYears: { type: Number, default: null }, // Investment duration, null = use global setting
    earlyWithdrawalPenaltyPercentage: { type: Number, default: null } // Penalty %, null = use global setting
  },

  analytics: {
    views: { type: Number, default: 0 },
    favorites: { type: Number, default: 0 }
  },

  priceHistory: [{
    date: { type: Date, default: Date.now },
    price: { type: Number, default: 0 },
    reason: {
      type: String,
      enum: ['initial', 'market_adjustment', 'valuation_update', 'admin_update']
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],

  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  lastModifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// Text search index
propertySchema.index({
  title: 'text',
  description: 'text'
});

// Virtual for funding percentage
propertySchema.virtual('fundingPercentage').get(function () {
  if (!this.financials.totalShares) return 0;
  const soldShares = this.financials.totalShares - this.financials.availableShares;
  return (soldShares / this.financials.totalShares) * 100;
});

// Pre-save middleware
propertySchema.pre('save', function (next) {
  // Update funding progress
  if (this.financials.totalShares > 0) {
    const soldShares = this.financials.totalShares - this.financials.availableShares;
    this.fundingProgress = (soldShares / this.financials.totalShares) * 100;
  }

  // Ensure seoData exists
  if (!this.seoData) this.seoData = {};

  // Generate slug if not provided
  if (!this.seoData.slug && this.title) {
    this.seoData.slug = this.title.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  next();
});

module.exports = mongoose.model('Property', propertySchema);
