const mongoose = require('mongoose');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Investment = require('../models/Investment');
require('dotenv').config();

async function clearTestData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/zeron');
    console.log('Connected to MongoDB');

    // Get admin user email from env or use default
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@yourcompany.com';

    console.log(`\nClearing test data for: ${adminEmail}\n`);

    // Find the admin user
    const user = await User.findOne({ email: adminEmail });
    if (!user) {
      console.log('User not found!');
      process.exit(1);
    }

    console.log('Current wallet balance:', user.wallet.balance);
    console.log('Current investments:', await Investment.countDocuments({ user: user._id }));
    console.log('Current transactions:', await Transaction.countDocuments({ user: user._id }));

    // Delete all test transactions
    const deletedTransactions = await Transaction.deleteMany({ user: user._id });
    console.log(`✅ Deleted ${deletedTransactions.deletedCount} transactions`);

    // Delete all test investments
    const deletedInvestments = await Investment.deleteMany({ user: user._id });
    console.log(`✅ Deleted ${deletedInvestments.deletedCount} investments`);

    // Reset wallet to zero
    user.wallet.balance = 0;
    user.wallet.totalDeposits = 0;
    user.wallet.totalWithdrawals = 0;
    user.wallet.totalReturns = 0;
    user.investmentSummary.totalInvested = 0;
    user.investmentSummary.currentValue = 0;
    user.investmentSummary.totalReturns = 0;
    user.investmentSummary.propertyCount = 0;
    await user.save();

    console.log('\n✅ All test data cleared successfully!');
    console.log('New wallet balance:', user.wallet.balance);
    console.log('\n');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

clearTestData();
