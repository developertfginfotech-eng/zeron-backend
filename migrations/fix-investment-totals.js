/**
 * Migration: Fix Investment Totals
 *
 * This migration recalculates user.wallet.totalInvested and user.investmentSummary.totalInvested
 * to use the original investment amounts (not net amounts after management fees).
 *
 * Previous bug: Management fees were deducted from the principal when storing totalInvested.
 * Fix: Store the original amount paid, and track management fees separately.
 *
 * Run with: node migrations/fix-investment-totals.js
 */

const mongoose = require('mongoose');
const User = require('../models/User');
const Investment = require('../models/Investment');
const Property = require('../models/Property');
const logger = require('../utils/logger');

// Connection string - update if needed
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/zeron';

async function migrateInvestmentTotals() {
  try {
    logger.info('Starting investment totals migration...');

    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    logger.info('Connected to MongoDB');

    // Get all users
    const users = await User.find({});
    logger.info(`Found ${users.length} users to migrate`);

    let successCount = 0;
    let errorCount = 0;

    // Process each user
    for (const user of users) {
      try {
        // Get all confirmed investments for this user (with populated property to check validity)
        const investments = await Investment.find({
          user: user._id,
          status: 'confirmed'
        }).populate('property', '_id').lean();

        // Filter out investments with null/invalid property references (portfolio endpoint does this too)
        const validInvestments = investments.filter(inv => inv.property && inv.property._id);

        // Calculate total invested as sum of original amounts (only for investments with properties)
        const totalInvested = validInvestments.reduce((sum, inv) => {
          return sum + (inv.amount || 0);
        }, 0);

        // Get property count
        const propertyCount = await Investment.distinct('property', {
          user: user._id,
          status: 'confirmed'
        });

        // Get latest investment date
        const latestInvestment = await Investment.findOne({
          user: user._id,
          status: 'confirmed'
        }).sort({ createdAt: -1 });

        // Update user document with recalculated values
        user.wallet.totalInvested = totalInvested;
        user.investmentSummary.totalInvested = totalInvested;
        user.investmentSummary.propertyCount = propertyCount.length;
        if (latestInvestment) {
          user.investmentSummary.lastInvestmentDate = latestInvestment.createdAt;
        }

        await user.save();

        const skippedCount = investments.length - validInvestments.length;
        logger.info(`✓ Migrated user ${user._id}: totalInvested = SAR ${totalInvested.toFixed(2)} (${validInvestments.length}/${investments.length} valid investments${skippedCount > 0 ? `, ${skippedCount} skipped` : ''})`);
        successCount++;

      } catch (userError) {
        errorCount++;
        logger.error(`✗ Failed to migrate user ${user._id}: ${userError.message}`, userError);
      }
    }

    logger.info(`\n=== MIGRATION COMPLETE ===`);
    logger.info(`Success: ${successCount} users`);
    logger.info(`Errors: ${errorCount} users`);
    logger.info(`Total: ${successCount + errorCount} users processed`);

    // Verify by checking a few users
    logger.info(`\n=== VERIFICATION ===`);
    const verifyUsers = await User.find({}).limit(3);
    for (const user of verifyUsers) {
      const totalFromInvestments = await Investment.aggregate([
        { $match: { user: user._id, status: 'confirmed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);
      const calculatedTotal = totalFromInvestments[0]?.total || 0;
      const storedTotal = user.wallet.totalInvested || 0;
      const match = Math.abs(calculatedTotal - storedTotal) < 0.01;
      logger.info(`User ${user.email}: Stored=${storedTotal.toFixed(2)}, Calculated=${calculatedTotal.toFixed(2)}, Match=${match}`);
    }

    process.exit(0);

  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migrateInvestmentTotals();
