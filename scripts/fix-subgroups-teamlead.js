const mongoose = require('mongoose');
require('dotenv').config();

const Group = require('../models/Group');
const User = require('../models/User');

async function fixSubgroups() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find all subgroups (groups with parentGroupId)
    const subgroups = await Group.find({ parentGroupId: { $ne: null } })
      .populate({
        path: 'members.userId',
        select: 'firstName lastName email role'
      });

    console.log(`\nFound ${subgroups.length} subgroups:\n`);

    for (const subgroup of subgroups) {
      console.log(`\n📁 Subgroup: ${subgroup.displayName} (${subgroup.name})`);
      console.log(`   Current teamLeadId: ${subgroup.teamLeadId || 'NOT SET'}`);
      console.log(`   Members: ${subgroup.members.length}`);

      // Show all members
      subgroup.members.forEach((member, index) => {
        const user = member.userId;
        console.log(`   ${index + 1}. ${user.firstName} ${user.lastName} (${user.email}) - Role: ${user.role}`);
      });

      // Find team lead in members (first member with team_lead role)
      const teamLeadMember = subgroup.members.find(m => m.userId.role === 'team_lead');

      if (teamLeadMember && !subgroup.teamLeadId) {
        console.log(`   ✅ Setting teamLeadId to: ${teamLeadMember.userId.firstName} ${teamLeadMember.userId.lastName}`);
        subgroup.teamLeadId = teamLeadMember.userId._id;
        await subgroup.save();
      } else if (!teamLeadMember) {
        console.log(`   ⚠️  No team lead member found in this subgroup`);
      } else {
        console.log(`   ℹ️  teamLeadId already set`);
      }
    }

    console.log('\n✅ Migration complete!');
    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

fixSubgroups();
