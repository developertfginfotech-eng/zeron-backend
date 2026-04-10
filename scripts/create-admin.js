const mongoose = require('mongoose');
require('dotenv').config();

async function createAdmin() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const User = require('../models/User');

    const email = 'janaadmin@zaron.com';
    const password = 'ZaronAdmin@123';
    const phone = '+966500000099';

    // Check if already exists
    const existing = await User.findOne({ email });
    if (existing) {
      console.log(`Admin already exists: ${email} — resetting password and unlocking...`);
      // Set raw password so the pre-save hook hashes it correctly (was being double-hashed)
      existing.password = password;
      existing.status = 'active';
      existing.role = 'super_admin';
      // Clear account lock
      existing.loginAttempts = 0;
      existing.lockUntil = undefined;
      existing.emailVerified = true;
      existing.isActive = true;
      await existing.save();
      console.log('Account fixed successfully!');
      console.log(`  Email:    ${email}`);
      console.log(`  Password: ${password}`);
      console.log(`  Role:     super_admin`);
      console.log(`  Status:   active (unlocked)`);
      await mongoose.disconnect();
      return;
    }

    // Pass the raw password — the User model's pre-save hook will hash it
    const admin = new User({
      firstName: 'Jana',
      lastName: 'Admin',
      email,
      phone,
      password,
      role: 'super_admin',
      status: 'active',
      emailVerified: true,
      isActive: true,
      kycStatus: 'approved'
    });

    await admin.save();
    console.log('Admin created successfully!');
    console.log(`  Email:    ${email}`);
    console.log(`  Password: ${password}`);
    console.log(`  Role:     super_admin`);

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

createAdmin();
