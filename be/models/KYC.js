const mongoose = require('mongoose');

const kycSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  documents: {
    nationalId: {
      url: String,
      publicId: String,
      uploadedAt: Date,
      verified: { type: Boolean, default: false }
    },
    selfie: {
      url: String,
      publicId: String,
      uploadedAt: Date,
      verified: { type: Boolean, default: false }
    },
    proofOfIncome: {
      url: String,
      publicId: String,
      uploadedAt: Date,
      type: {
        type: String,
        enum: ['salary_certificate', 'bank_statement', 'tax_return']
      },
      verified: { type: Boolean, default: false }
    },
    addressProof: {
      url: String,
      publicId: String,
      uploadedAt: Date,
      type: {
        type: String,
        enum: ['utility_bill', 'bank_statement', 'lease_agreement']
      },
      verified: { type: Boolean, default: false }
    }
  },
  personalInfo: {
    fullNameArabic: String,
    fullNameEnglish: String,
    dateOfBirth: Date,
    nationality: { type: String, default: 'SA' },
    occupation: String,
    monthlyIncome: Number,
    sourceOfFunds: {
      type: String,
      enum: ['salary', 'business', 'investment', 'inheritance']
    }
  },
  address: {
    street: String,
    city: String,
    region: String,
    postalCode: String,
    country: { type: String, default: 'Saudi Arabia' }
  },
  status: {
    type: String,
    enum: ['pending', 'submitted', 'under_review', 'approved', 'rejected'],
    default: 'pending'
  },
  submittedAt: Date,
  reviewedAt: Date,
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  rejectionReasons: [String],
  reviewNotes: String
}, {
  timestamps: true
});


kycSchema.virtual('completionPercentage').get(function() {
  let completed = 0;
  let total = 4;
  
  if (this.documents.nationalId?.url) completed++;
  if (this.documents.selfie?.url) completed++;
  if (this.documents.proofOfIncome?.url) completed++;
  if (this.documents.addressProof?.url) completed++;
  
  return Math.round((completed / total) * 100);
});

module.exports = mongoose.model('KYC', kycSchema);