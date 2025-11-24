# Database Migration: Fix Maturity Dates

## Problem
Old investments have incorrect maturity dates calculated as 5 hours from investment date instead of 5 years.

## Solution
This migration script recalculates all maturity dates correctly using real years.

## How to Run

### Step 1: Make sure your backend server is STOPPED
```bash
# Press Ctrl+C or Command+C to stop the server if it's running
```

### Step 2: Navigate to the backend directory
```bash
cd /Users/barshatfg/zeron/zeron-backend
```

### Step 3: Run the migration script
```bash
node scripts/fix-maturity-dates.js
```

### Step 4: Check the output
You should see something like:
```
✅ MongoDB Connected
🔄 Starting maturity date migration...
📊 Found X investments to update

✅ Updated: 12345...
   Created: 24/11/2025
   Old Maturity: 24/11/2025
   New Maturity: 24/11/2030
   Period: 5 years

============================================================
📊 Migration Summary:
============================================================
Total Investments: 20
✅ Updated: 18
⏭️  Skipped: 2
============================================================

✅ Migration completed successfully!
🎉 All done! You can now restart your backend server.
```

### Step 5: Restart your backend server
```bash
npm start
# or
npm run dev
```

### Step 6: Refresh your frontend
- Go to your browser
- Press Ctrl+Shift+R (or Cmd+Shift+R on Mac) to hard refresh
- Check the portfolio page
- All investments should now show correct maturity dates!

## What the Script Does

1. Connects to your MongoDB database
2. Finds all investments
3. For each investment:
   - Gets the creation date
   - Gets the maturity period (default 5 years)
   - Calculates: Maturity Date = Creation Date + Maturity Period (in YEARS)
   - Updates the database if the date is different
4. Shows a summary of changes

## Safety

- ✅ This script is **safe** to run
- ✅ It only updates the `maturityDate` field
- ✅ It doesn't delete or modify any other data
- ✅ You can run it multiple times (it will skip already-correct dates)
- ✅ It doesn't affect the backend server (run it while server is stopped)

## Troubleshooting

### Error: "Cannot find module '../models/Investment'"
- Make sure you're in the `/zeron-backend` directory
- Run: `cd /Users/barshatfg/zeron/zeron-backend`

### Error: "MongoDB Connection Error"
- Make sure your MongoDB is running
- Check your `.env` file has correct `MONGODB_URI`

### Error: "Investment model not found"
- Make sure the Investment model file exists at `models/Investment.js`

## After Migration

All investments will show:
- ✅ Correct maturity dates (5 years from investment date)
- ✅ Investment Date: 24/11/2025 → Matures On: 24/11/2030
- ✅ Investment Date: 13/11/2025 → Matures On: 13/11/2030
- ✅ No more "N/A" or same-day maturity dates
