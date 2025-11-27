const mongoose = require('mongoose');
require('dotenv').config();

async function clearDatabase() {
  try {
    console.log('🔄 Connecting to MongoDB...');

    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('✅ Connected to MongoDB');

    // Clear users collection
    const result = await mongoose.connection.collection('users').deleteMany({});

    console.log(`\n✅ SUCCESS: Deleted ${result.deletedCount} documents from users collection`);

    // Also drop the collection to reset indexes
    await mongoose.connection.collection('users').drop();
    console.log('✅ Dropped users collection (indexes reset)');

    console.log('\n🎉 Database cleared successfully!');
    console.log('⚠️  Remember to restart your backend server\n');

    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');

  } catch (error) {
    console.error('\n❌ Error clearing database:', error.message);
    process.exit(1);
  }
}

clearDatabase();
