const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://developertfginfotech_db_user:tfg123456@cluster0.9brerg5.mongodb.net/';

const groupSchema = new mongoose.Schema({
  name: String,
  displayName: String,
  members: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    memberPermissions: Array,
    addedAt: Date,
    addedBy: mongoose.Schema.Types.ObjectId
  }],
  permissions: Array,
  isActive: Boolean
}, { collection: 'groups' });

const Group = mongoose.model('Group', groupSchema);

const userSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  email: String,
  role: String
}, { collection: 'users' });

const User = mongoose.model('User', userSchema);

async function checkAndCleanGroups() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const groups = await Group.find({}).lean();
    console.log(`📊 Found ${groups.length} groups in database:\n`);

    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      console.log(`${i + 1}. ${group.displayName || group.name}`);
      console.log(`   ID: ${group._id}`);
      console.log(`   Active: ${group.isActive}`);
      console.log(`   Members: ${group.members.length}`);

      // Get member details
      for (const member of group.members) {
        const user = await User.findById(member.userId).lean();
        if (user) {
          console.log(`   - ${user.firstName} ${user.lastName} (${user.email}) - Role: ${user.role}`);
        } else {
          console.log(`   - Unknown user (ID: ${member.userId})`);
        }
      }
      console.log('');
    }

    // Delete all groups
    console.log('\n🗑️  Deleting all groups...');
    const result = await Group.deleteMany({});
    console.log(`✅ Deleted ${result.deletedCount} groups\n`);

    await mongoose.disconnect();
    console.log('✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

checkAndCleanGroups();
