# Property-Specific Investment Terms Guide

## 🎯 Overview

**Every property has its own unique investment terms** set by the admin:
- ✅ Rental Yield Rate (different for each property)
- ✅ Appreciation Rate (different for each property)
- ✅ Maturity Period (different for each property)
- ✅ Early Withdrawal Penalty (different for each property)
- ✅ Price Per Share (different for each property)
- ✅ Total Shares (different for each property)

---

## 📋 Complete Postman Body - Admin Creates Property

### Endpoint
```
POST http://localhost:5001/api/admin/properties
Authorization: Bearer {{admin_token}}
Content-Type: multipart/form-data
```

### Form Data (Complete Example)

```
title: "Luxury Villa in Riyadh"

description: "Beautiful modern villa with 5 bedrooms, swimming pool, and garden"

propertyType: "residential"

status: "active"

location: {"city":"Riyadh","district":"Al Narjis","address":"123 King Fahd Road"}

financials: {
  "totalValue": 2000000,
  "pricePerShare": 5000,
  "totalShares": 400,
  "availableShares": 400,
  "minInvestment": 5000,
  "projectedYield": 8
}

investmentTerms: {
  "rentalYieldRate": 8,
  "appreciationRate": 5,
  "lockingPeriodYears": 3,
  "investmentDurationYears": 5,
  "earlyWithdrawalPenaltyPercentage": 15
}

otp: "123456"

images: [villa1.jpg, villa2.jpg, villa3.jpg]
```

---

## 🏢 Example: Different Properties, Different Terms

### Property A: Commercial Building (High Rental, Low Appreciation)

```json
{
  "title": "Downtown Commercial Tower",
  "financials": {
    "totalValue": 5000000,
    "pricePerShare": 10000,
    "totalShares": 500,
    "availableShares": 500,
    "minInvestment": 10000,
    "projectedYield": 12
  },
  "investmentTerms": {
    "rentalYieldRate": 12,           ← High rental (commercial property)
    "appreciationRate": 3,            ← Lower appreciation
    "lockingPeriodYears": 5,          ← Longer maturity
    "earlyWithdrawalPenaltyPercentage": 20  ← Higher penalty
  }
}
```

### Property B: Residential Villa (Balanced)

```json
{
  "title": "Luxury Villa in Riyadh",
  "financials": {
    "totalValue": 2000000,
    "pricePerShare": 5000,
    "totalShares": 400,
    "availableShares": 400,
    "minInvestment": 5000,
    "projectedYield": 8
  },
  "investmentTerms": {
    "rentalYieldRate": 8,             ← Moderate rental
    "appreciationRate": 5,            ← Good appreciation
    "lockingPeriodYears": 3,          ← Standard maturity
    "earlyWithdrawalPenaltyPercentage": 15  ← Standard penalty
  }
}
```

### Property C: Retail Space (Very High Rental)

```json
{
  "title": "Prime Retail Space - Mall",
  "financials": {
    "totalValue": 3000000,
    "pricePerShare": 15000,
    "totalShares": 200,
    "availableShares": 200,
    "minInvestment": 15000,
    "projectedYield": 15
  },
  "investmentTerms": {
    "rentalYieldRate": 15,            ← Very high rental (retail)
    "appreciationRate": 2,            ← Low appreciation
    "lockingPeriodYears": 7,          ← Very long maturity
    "earlyWithdrawalPenaltyPercentage": 25  ← Very high penalty
  }
}
```

---

## 💰 User Investment - Complete Postman Body

### Endpoint
```
POST http://localhost:5001/api/investments
Authorization: Bearer {{user_token}}
Content-Type: application/json
```

### Request Body
```json
{
  "propertyId": "674a1234567890abcdef1234",
  "amount": 50000
}
```

### Success Response (201 Created)
```json
{
  "success": true,
  "data": {
    "investmentId": "674b9876543210fedcba4321",
    "propertyId": "674a1234567890abcdef1234",
    "amount": 50000,
    "shares": 10,
    "status": "confirmed",
    "investedAt": "2024-11-17T10:30:00.000Z",
    "message": "Successfully invested SAR 50000 in property"
  }
}
```

**Note:** The backend automatically:
- Calculates shares: `amount ÷ pricePerShare = shares`
- Uses **property-specific** investment terms (rental yield, appreciation, etc.)
- Creates maturity date based on property's `lockingPeriodYears`

---

## 🔍 How Backend Selects Investment Terms

```javascript
// From routes/investments.js lines 146-150

const propertySettings = property.investmentTerms || {};

// Priority: Property-specific → Global settings → Defaults
const rentalYield = propertySettings.rentalYieldRate !== null
  ? propertySettings.rentalYieldRate          // ← Use property-specific
  : settings.rentalYieldPercentage;           // ← Fallback to global

const appreciation = propertySettings.appreciationRate !== null
  ? propertySettings.appreciationRate         // ← Use property-specific
  : settings.appreciationRatePercentage;      // ← Fallback to global

const penalty = propertySettings.earlyWithdrawalPenaltyPercentage !== null
  ? propertySettings.earlyWithdrawalPenaltyPercentage  // ← Use property-specific
  : settings.earlyWithdrawalPenaltyPercentage;         // ← Fallback to global

const maturityPeriod = propertySettings.lockingPeriodYears !== null
  ? propertySettings.lockingPeriodYears       // ← Use property-specific
  : settings.maturityPeriodYears;             // ← Fallback to global
```

---

## 📊 Investment Calculations Use Property-Specific Terms

### Example: SAR 50,000 Investment in Villa (8% rental, 5% appreciation, 3 years)

```javascript
Investment Details:
- Amount: SAR 50,000
- Shares: 10 units @ SAR 5,000/unit
- Rental Yield: 8% (from property.investmentTerms.rentalYieldRate)
- Appreciation: 5% (from property.investmentTerms.appreciationRate)
- Maturity: 3 years (from property.investmentTerms.lockingPeriodYears)
- Penalty: 15% (from property.investmentTerms.earlyWithdrawalPenaltyPercentage)

After 3 Years (At Maturity):
- Principal: SAR 50,000
- Rental Yield: SAR 12,000 (50,000 × 8% × 3 years)
- Appreciation: SAR 0 (only after maturity)
- Total: SAR 62,000
```

### Example: SAR 100,000 Investment in Commercial Tower (12% rental, 3% appreciation, 5 years)

```javascript
Investment Details:
- Amount: SAR 100,000
- Shares: 10 units @ SAR 10,000/unit
- Rental Yield: 12% (from property.investmentTerms.rentalYieldRate)
- Appreciation: 3% (from property.investmentTerms.appreciationRate)
- Maturity: 5 years (from property.investmentTerms.lockingPeriodYears)
- Penalty: 20% (from property.investmentTerms.earlyWithdrawalPenaltyPercentage)

After 5 Years (At Maturity):
- Principal: SAR 100,000
- Rental Yield: SAR 60,000 (100,000 × 12% × 5 years)
- Appreciation: SAR 0 (only after maturity)
- Total: SAR 160,000
```

---

## 🧪 Testing Workflow in Postman

### Step 1: Login as Admin
```
POST http://localhost:5001/api/auth/login
Body: {
  "email": "admin@yourcompany.com",
  "password": "AdminSecure123!"
}
→ Save admin_token
```

### Step 2: Create Property with Specific Investment Terms
```
POST http://localhost:5001/api/admin/properties
Authorization: Bearer {{admin_token}}

Form Data:
  title: "Test Villa"
  description: "Test property"
  propertyType: "residential"
  status: "active"
  location: {"city":"Riyadh","address":"Test St"}
  financials: {"totalValue":1000000,"pricePerShare":5000,"totalShares":200,"availableShares":200,"minInvestment":5000}
  investmentTerms: {"rentalYieldRate":10,"appreciationRate":6,"lockingPeriodYears":2,"earlyWithdrawalPenaltyPercentage":10}
  otp: "123456"

→ Save property_id from response
```

### Step 3: Login as Regular User
```
POST http://localhost:5001/api/auth/login
Body: {
  "email": "user@example.com",
  "password": "Password123!"
}
→ Save user_token
```

### Step 4: Recharge Wallet (if needed)
```
POST http://localhost:5001/api/wallet/recharge
Authorization: Bearer {{user_token}}
Body: {
  "amount": 100000,
  "method": "bank_transfer"
}
```

### Step 5: Create Investment (Send Units/Shares)
```
POST http://localhost:5001/api/investments
Authorization: Bearer {{user_token}}
Body: {
  "propertyId": "{{property_id}}",
  "shares": 10
}

✅ Backend automatically:
- Calculates amount: 10 shares × pricePerShare
- Uses property-specific terms:
  - Rental: 10% (from property)
  - Appreciation: 6% (from property)
  - Maturity: 2 years (from property)
  - Penalty: 10% (from property)
```

### Step 6: Verify Investment
```
GET http://localhost:5001/api/investments/my-investments
Authorization: Bearer {{user_token}}

Response shows investment with property-specific rates!
```

---

## ✅ Key Points

1. **Each property has unique investment terms** - set by admin when creating property
2. **Backend automatically uses property-specific terms** - no need to pass them in investment request
3. **Falls back to global settings** - if property terms are not set (null)
4. **Frontend modal shows property-specific terms** - users see exact terms before investing
5. **Shares calculation is automatic** - backend divides amount by pricePerShare

---

## 🎯 Complete API Flow

```
1. Admin Creates Property
   ↓
   Sets property-specific investmentTerms
   ↓
2. User Views Property
   ↓
   Sees property-specific rental yield, appreciation, maturity
   ↓
3. User Clicks "Invest"
   ↓
   Investment modal shows property-specific terms
   ↓
4. User Selects Units
   ↓
   Total = units × pricePerShare
   ↓
5. User Confirms Investment
   ↓
   POST /api/investments with propertyId + amount
   ↓
6. Backend Creates Investment
   ↓
   Automatically applies property-specific terms
   ↓
7. Investment Saved with Property's Terms
   ↓
   User earns returns based on THAT property's rates
```

---

## 📝 Important Notes

- **Different properties = Different returns** based on their specific terms
- **Admin controls all terms** when creating/editing property
- **Users see exact terms** before investing (no surprises!)
- **Backend handles everything automatically** - just send propertyId + shares (units)
- **Investment terms are locked in** at time of investment (stored in Investment model)
