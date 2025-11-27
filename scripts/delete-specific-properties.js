const mongoose = require('mongoose');
const Property = require('../models/Property');
require('dotenv').config();

async function deleteSpecificProperties() {
  try {
    console.log('🔄 Connecting to MongoDB...');

    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('✅ Connected to MongoDB\n');

    // List of properties to delete
    const propertiesToDelete = [
      'Test Property 4',
      'Test Property 3',
      'Test Property',
      'QQQQQ'
    ];

    console.log('🗑️  Deleting properties:');
    propertiesToDelete.forEach(name => console.log(`   • ${name}`));
    console.log('');

    // Delete each property by title
    for (const propertyName of propertiesToDelete) {
      const result = await Property.deleteMany({
        $or: [
          { title: propertyName },
          { titleAr: propertyName }
        ]
      });

      if (result.deletedCount > 0) {
        console.log(`✅ Deleted "${propertyName}" (${result.deletedCount} record${result.deletedCount > 1 ? 's' : ''})`);
      } else {
        console.log(`⚠️  "${propertyName}" not found`);
      }
    }

    // Show remaining properties
    const remaining = await Property.countDocuments();
    console.log(`\n📊 Total active properties remaining: ${remaining}`);

    // List all remaining properties
    const remainingProperties = await Property.find({}, 'title status').limit(10);
    if (remainingProperties.length > 0) {
      console.log('\n📋 Remaining properties (first 10):');
      remainingProperties.forEach(prop => {
        console.log(`   • ${prop.title} [${prop.status}]`);
      });
    }

    console.log('\n🎉 Cleanup completed successfully!\n');

    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');

  } catch (error) {
    console.error('\n❌ Error deleting properties:', error.message);
    process.exit(1);
  }
}

deleteSpecificProperties();
