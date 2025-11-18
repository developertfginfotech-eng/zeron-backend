# Complete Investment Flow Guide

## 🎯 Investment Model Overview

Users purchase **units/shares** of properties and earn returns through:
1. **Rental Yield** - Earned throughout the holding period
2. **Appreciation** - Earned only AFTER maturity period
3. **Maturity Period** - Minimum holding time
4. **Early Withdrawal Penalty** - Applied if withdrawn before maturity

---

## 📊 Example Investment Scenario

### Property Setup (By Admin):
```json
{
  "title": "Luxury Villa in Riyadh",
  "financials": {
    "totalValue": 2000000,      // SAR 2M total value
    "totalShares": 400,          // 400 units available
    "pricePerShare": 5000,       // SAR 5,000 per unit
    "availableShares": 400       // All available
  },
  "investmentTerms": {
    "rentalYieldRate": 8,        // 8% annual rental yield
    "appreciationRate": 5,       // 5% annual appreciation
    "lockingPeriodYears": 3,     // 3 years maturity period
    "earlyWithdrawalPenaltyPercentage": 15  // 15% penalty
  }
}
```

---

## 💰 User Investment Example

### Step 1: User Purchases Units
```
User wants to invest SAR 50,000

Calculation:
- Price per unit: SAR 5,000
- Units purchased: 50,000 ÷ 5,000 = 10 units
- Total investment: SAR 50,000
```

### Step 2: Investment Record Created
```json
{
  "user": "userId",
  "property": "propertyId",
  "shares": 10,
  "amount": 50000,
  "pricePerShare": 5000,
  "rentalYieldRate": 8,
  "appreciationRate": 5,
  "penaltyRate": 15,
  "maturityPeriodYears": 3,
  "maturityDate": "2027-11-17",  // 3 years from now
  "status": "confirmed"
}
```

---

## 📈 Returns Calculation

### Scenario A: Early Withdrawal (Before Maturity)

**Timeline:** User withdraws after 1.5 years (before 3-year maturity)

```javascript
Principal Amount: SAR 50,000
Rental Yield Rate: 8% per year
Holding Period: 1.5 years

// Calculate Rental Yield Earned
Annual Rental Income = 50,000 × 0.08 = SAR 4,000
Total Rental Yield = 4,000 × 1.5 = SAR 6,000

// NO Appreciation (only after maturity)
Appreciation Gain = SAR 0

// Apply Early Withdrawal Penalty
Penalty = 50,000 × 0.15 = SAR 7,500

// Final Withdrawal Amount
Withdrawal = Principal + Rental Yield - Penalty
Withdrawal = 50,000 + 6,000 - 7,500
Withdrawal = SAR 48,500
```

**Result:** User loses SAR 1,500 due to early withdrawal!

---

### Scenario B: Withdrawal AT Maturity (3 years)

**Timeline:** User withdraws exactly at 3-year maturity

```javascript
Principal Amount: SAR 50,000
Rental Yield Rate: 8% per year
Appreciation Rate: 5% per year
Holding Period: 3 years (at maturity)

// Calculate Rental Yield (full 3 years)
Annual Rental Income = 50,000 × 0.08 = SAR 4,000
Total Rental Yield = 4,000 × 3 = SAR 12,000

// NO Appreciation Yet (need to hold AFTER maturity)
Years After Maturity = 0
Appreciation Gain = SAR 0

// NO Penalty (at or after maturity)
Penalty = SAR 0

// Final Withdrawal Amount
Withdrawal = Principal + Rental Yield + Appreciation
Withdrawal = 50,000 + 12,000 + 0
Withdrawal = SAR 62,000
```

**Result:** SAR 12,000 profit (24% total return over 3 years)

---

### Scenario C: Long-term Hold (5 years - After Maturity)

**Timeline:** User holds for 5 years (2 years after maturity)

```javascript
Principal Amount: SAR 50,000
Rental Yield Rate: 8% per year
Appreciation Rate: 5% per year
Maturity Period: 3 years
Holding Period: 5 years total

// Calculate Rental Yield (capped at maturity period)
Annual Rental Income = 50,000 × 0.08 = SAR 4,000
Total Rental Yield = 4,000 × 3 = SAR 12,000  // Max 3 years

// Calculate Appreciation (2 years AFTER maturity)
Years After Maturity = 5 - 3 = 2 years
Appreciation = 50,000 × (1.05)^2 = 50,000 × 1.1025 = SAR 55,125
Appreciation Gain = 55,125 - 50,000 = SAR 5,125

// NO Penalty (after maturity)
Penalty = SAR 0

// Final Withdrawal Amount
Withdrawal = Principal + Rental Yield + Appreciation
Withdrawal = 50,000 + 12,000 + 5,125
Withdrawal = SAR 67,125
```

**Result:** SAR 17,125 profit (34.25% total return over 5 years)

---

### Scenario D: Very Long Hold (10 years)

**Timeline:** User holds for 10 years (7 years after maturity)

```javascript
Principal Amount: SAR 50,000
Years After Maturity: 10 - 3 = 7 years

// Rental Yield (capped at 3 years)
Total Rental Yield = 4,000 × 3 = SAR 12,000

// Appreciation (compound for 7 years after maturity)
Appreciation = 50,000 × (1.05)^7 = 50,000 × 1.4071 = SAR 70,355
Appreciation Gain = 70,355 - 50,000 = SAR 20,355

// Final Withdrawal
Withdrawal = 50,000 + 12,000 + 20,355 = SAR 82,355
```

**Result:** SAR 32,355 profit (64.71% total return over 10 years)

---

## 📋 Summary Table

| Scenario | Hold Period | Rental Yield | Appreciation | Penalty | Withdrawal | Profit | ROI |
|----------|-------------|--------------|--------------|---------|------------|--------|-----|
| **Early (1.5y)** | 1.5 years | SAR 6,000 | SAR 0 | SAR 7,500 | SAR 48,500 | -SAR 1,500 | -3% |
| **At Maturity (3y)** | 3 years | SAR 12,000 | SAR 0 | SAR 0 | SAR 62,000 | SAR 12,000 | 24% |
| **Post-Maturity (5y)** | 5 years | SAR 12,000 | SAR 5,125 | SAR 0 | SAR 67,125 | SAR 17,125 | 34.25% |
| **Long-term (10y)** | 10 years | SAR 12,000 | SAR 20,355 | SAR 0 | SAR 82,355 | SAR 32,355 | 64.71% |

---

## 🔑 Key Rules

### 1. **Rental Yield**
- ✅ Earned from day 1
- ✅ Calculated annually
- ✅ Capped at maturity period (e.g., 3 years max)
- ✅ Earned even if withdrawn early

### 2. **Appreciation**
- ❌ NOT earned during maturity period
- ✅ ONLY earned AFTER maturity
- ✅ Compounds annually (1.05^years)
- ✅ Applied to principal amount
- ✅ Unlimited (grows as long as you hold)

### 3. **Maturity Period (Locking Period)**
- ⏰ Minimum holding time (e.g., 3 years)
- 🔒 Early withdrawal = penalty applied
- ✅ After maturity = no penalty
- 💰 Can hold longer to earn more appreciation

### 4. **Early Withdrawal Penalty**
- ⚠️ Applied to PRINCIPAL amount
- ⚠️ Only before maturity
- ✅ No penalty after maturity
- 📉 Can result in loss if withdrawn too early

---

## 🧮 Calculation Logic

### During Maturity Period (0 - 3 years):
```
Value = Principal + (Rental Yield × Years Held)
Appreciation = 0
```

### After Maturity (3+ years):
```
Rental Yield = Annual Rental × Maturity Period (capped)
Appreciation = Principal × (1 + Rate)^(Years After Maturity) - Principal
Total Value = Principal + Rental Yield + Appreciation
```

### Early Withdrawal:
```
Value = Principal + Rental Yield - (Principal × Penalty Rate)
```

---

## 📱 API Testing Examples

### Create Investment
```bash
POST http://localhost:5001/api/investments
Authorization: Bearer {user_token}
Content-Type: application/json

{
  "propertyId": "property_id",
  "amount": 50000
}

# System automatically calculates:
# - Shares: 50000 / 5000 = 10 units
# - Saves all rates (rental, appreciation, penalty)
# - Sets maturity date
```

### Withdraw Investment (Early)
```bash
POST http://localhost:5001/api/investments/{investmentId}/withdraw
Authorization: Bearer {user_token}

Response:
{
  "success": true,
  "data": {
    "withdrawalDetails": {
      "principalAmount": 50000,
      "rentalYieldEarned": 6000,
      "appreciationGain": 0,
      "penalty": 7500,
      "totalWithdrawalAmount": 48500
    },
    "timing": {
      "holdingPeriodYears": "1.50",
      "isEarlyWithdrawal": true
    }
  }
}
```

### Withdraw Investment (After Maturity)
```bash
POST http://localhost:5001/api/investments/{investmentId}/withdraw
Authorization: Bearer {user_token}

Response:
{
  "success": true,
  "data": {
    "withdrawalDetails": {
      "principalAmount": 50000,
      "rentalYieldEarned": 12000,
      "appreciationGain": 5125,
      "penalty": 0,
      "totalWithdrawalAmount": 67125
    },
    "timing": {
      "holdingPeriodYears": "5.00",
      "isEarlyWithdrawal": false
    }
  }
}
```

---

## ✅ Implementation Checklist

- [x] User purchases units/shares
- [x] Rental yield calculated and earned
- [x] Maturity period enforced
- [x] Early withdrawal penalty applied
- [x] Appreciation calculated after maturity
- [x] Compound appreciation for long-term holds
- [x] Wallet balance updated on withdrawal
- [x] Transaction records created
- [x] Full return breakdown in response

---

## 🎯 Investor Decision Guide

**Should I withdraw early?**
- ❌ NO - You'll lose money due to penalty
- ✅ Wait until maturity minimum

**Should I withdraw at maturity?**
- ✅ If you need the money (get rental yield)
- ❌ If you can wait (appreciation grows forever!)

**How long should I hold?**
- The longer you hold AFTER maturity, the more you earn!
- Appreciation compounds annually
- Example: 5% appreciation doubles your money in ~14 years

**Best Strategy:**
- Hold for at least maturity period (3 years)
- Hold longer to maximize appreciation
- Early withdrawal = guaranteed loss
