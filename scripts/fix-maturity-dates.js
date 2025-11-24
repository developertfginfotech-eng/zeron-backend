/**
 * Migration Script: Fix Maturity Dates for Existing Investments
 *
 * This script updates all existing investments to have correct maturity dates
 * calculated as: Investment Date + Maturity Period (in YEARS, not hours)
 *
 * Run this script once after deploying the backend fix
 */

const mongoose = require('mongoose');
const Investment = require('../models/Investment');
require('dotenv').config();

// Database connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/zeron', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB Connected');
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error);
    process.exit(1);
  }
};

// Main migration function
const fixMaturityDates = async () => {
  try {
    console.log('\n🔄 Starting maturity date migration...\n');

    // Get all investments
    const investments = await Investment.find({});
    console.log(`📊 Found ${investments.length} investments to update\n`);

    if (investments.length === 0) {
      console.log('ℹ️  No investments found to update');
      return;
    }

    let updatedCount = 0;
    let skippedCount = 0;

    // Process each investment
    for (const investment of investments) {
      try {
        // Get investment creation date
        const createdAt = new Date(investment.createdAt);

        // Get maturity period in years (default 5 if not set)
        const maturityPeriodYears = investment.maturityPeriodYears || 5;

        // Calculate correct maturity date (in real years)
        const correctMaturityDate = new Date(createdAt);
        correctMaturityDate.setFullYear(correctMaturityDate.getFullYear() + maturityPeriodYears);

        // Check if update is needed
        const currentMaturityDate = investment.maturityDate ? new Date(investment.maturityDate) : null;

        if (!currentMaturityDate || Math.abs(currentMaturityDate - correctMaturityDate) > 24 * 60 * 60 * 1000) {
          // Update maturity date
          investment.maturityDate = correctMaturityDate;
          await investment.save();

          console.log(`✅ Updated: ${investment._id}`);
          console.log(`   Created: ${createdAt.toLocaleDateString()}`);
          console.log(`   Old Maturity: ${currentMaturityDate ? currentMaturityDate.toLocaleDateString() : 'N/A'}`);
          console.log(`   New Maturity: ${correctMaturityDate.toLocaleDateString()}`);
          console.log(`   Period: ${maturityPeriodYears} years\n`);

          updatedCount++;
        } else {
          console.log(`⏭️  Skipped (already correct): ${investment._id}`);
          skippedCount++;
        }
      } catch (error) {
        console.error(`❌ Error updating investment ${investment._id}:`, error.message);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Migration Summary:');
    console.log('='.repeat(60));
    console.log(`Total Investments: ${investments.length}`);
    console.log(`✅ Updated: ${updatedCount}`);
    console.log(`⏭️  Skipped: ${skippedCount}`);
    console.log('='.repeat(60) + '\n');

    console.log('✅ Migration completed successfully!\n');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
};

// Run the migration
const runMigration = async () => {
  try {
    await connectDB();
    await fixMaturityDates();

    console.log('🎉 All done! You can now restart your backend server.\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration script failed:', error);
    process.exit(1);
  }
};

// Execute
runMigration();
