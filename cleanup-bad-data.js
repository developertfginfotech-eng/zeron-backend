/**
 * Cleanup Script: Delete Bad Withdrawal Requests AND Bad Transactions
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const WithdrawalRequest = require('./models/WithdrawalRequest');
const Transaction = require('./models/Transaction');

async function cleanupBadData() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/zeron');
    console.log('✅ Connected to MongoDB');

    // Delete bad withdrawal requests (amount > 100,000)
    const badWithdrawals = await WithdrawalRequest.find({ amount: { $gt: 100000 } });
    console.log(`\n📊 Found ${badWithdrawals.length} bad withdrawal requests`);

    if (badWithdrawals.length > 0) {
      const result1 = await WithdrawalRequest.deleteMany({ amount: { $gt: 100000 } });
      console.log(`✅ Deleted ${result1.deletedCount} bad withdrawal requests`);
    }

    // Delete bad transactions (amount > 100,000)
    const badTransactions = await Transaction.find({ amount: { $gt: 100000 } });
    console.log(`\n📊 Found ${badTransactions.length} bad transactions`);

    if (badTransactions.length > 0) {
      const result2 = await Transaction.deleteMany({ amount: { $gt: 100000 } });
      console.log(`✅ Deleted ${result2.deletedCount} bad transactions`);
    }

    // Show remaining data
    const remainingWithdrawals = await WithdrawalRequest.find();
    const remainingTransactions = await Transaction.find({ type: 'payout' }).limit(10);

    console.log(`\n📊 Remaining withdrawal requests: ${remainingWithdrawals.length}`);
    console.log(`📊 Recent payout transactions: ${remainingTransactions.length}`);

    console.log('\n✨ Cleanup completed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
    process.exit(1);
  }
}

cleanupBadData();
