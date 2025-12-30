const mongoose = require('mongoose');
require('dotenv').config();

const Group = require('../models/Group');
const User = require('../models/User');

async function checkRootGroups() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const rootGroups = await Group.find({ parentGroupId: null })
      .populate({
        path: 'members.userId',
        select: 'firstName lastName email role'
      })
      .select('displayName name groupAdminId members');

    console.log(`\nFound ${rootGroups.length} root groups:\n`);

    for (const group of rootGroups) {
      console.log(`📁 ${group.displayName} (${group.name})`);
      console.log(`   groupAdminId: ${group.groupAdminId || 'NOT SET'}`);
      console.log(`   Members (${group.members.length}):`);

      let adminMember = null;
      group.members.forEach((m, i) => {
        const u = m.userId;
        console.log(`      ${i+1}. ${u.firstName} ${u.lastName} (${u.email}) - ${u.role}`);

        // Find first admin in members
        if (!adminMember && u.role === 'admin') {
          adminMember = m;
        }
      });

      // If no groupAdminId but has an admin member, set it
      if (!group.groupAdminId && adminMember) {
        console.log(`   ✅ Setting groupAdminId to: ${adminMember.userId.firstName} ${adminMember.userId.lastName}`);
        group.groupAdminId = adminMember.userId._id;
        await group.save();
      } else if (!group.groupAdminId && !adminMember) {
        console.log(`   ⚠️  No admin member found to set as groupAdminId`);
      } else {
        console.log(`   ℹ️  groupAdminId already set`);
      }

      console.log('');
    }

    console.log('✅ Check complete!');
    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

checkRootGroups();
