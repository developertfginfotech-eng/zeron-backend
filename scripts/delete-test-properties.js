const mongoose = require('mongoose');
const Property = require('../models/Property');
require('dotenv').config();

async function deleteTestProperties() {
  try {
    console.log('🔄 Connecting to MongoDB...');

    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('✅ Connected to MongoDB');

    // Delete properties that are not 'active' (test/draft properties)
    const result = await Property.deleteMany({
      status: { $ne: 'active' }
    });

    console.log(`\n✅ Deleted ${result.deletedCount} test/inactive properties`);
    console.log(`   Status: Only 'active' properties remain`);

    // Show remaining properties
    const remaining = await Property.countDocuments({ status: 'active' });
    console.log(`\n📊 Active properties remaining: ${remaining}`);

    console.log('\n🎉 Cleanup completed successfully!\n');

    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');

  } catch (error) {
    console.error('\n❌ Error deleting properties:', error.message);
    process.exit(1);
  }
}

deleteTestProperties();
