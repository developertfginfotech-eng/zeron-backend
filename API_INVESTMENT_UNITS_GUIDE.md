# ✅ Investment API - Send Units (Shares) Directly

## 🎯 Updated API Format

The investment API now accepts **shares (units)** directly instead of amount!

---

## 📋 NEW Recommended Format

### **POST /api/investments**

```
POST http://localhost:5001/api/investments
Authorization: Bearer {{user_token}}
Content-Type: application/json

{
  "propertyId": "674a1234567890abcdef1234",
  "shares": 10
}
```

### **Success Response (201 Created)**

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

**Backend automatically calculates:**
- Amount: `10 shares × SAR 5,000 per share = SAR 50,000`
- Uses property-specific investment terms
- Deducts from wallet balance
- Creates investment record

---

## 🔄 Backward Compatible (Old Format Still Works)

### **Alternative: Send Amount**

```json
{
  "propertyId": "674a1234567890abcdef1234",
  "amount": 50000
}
```

Backend will calculate: `50000 ÷ 5000 = 10 shares`

---

## 📊 Validation

### **When sending shares:**
```javascript
✅ Minimum shares: Based on minInvestment ÷ pricePerShare
✅ Maximum shares: Property's availableShares
✅ Checks wallet balance: shares × pricePerShare ≤ wallet balance
```

### **Error Examples:**

**Insufficient Shares:**
```json
{
  "success": false,
  "message": "Minimum 2 shares required (SAR 5000 minimum investment)"
}
```

**Exceeds Available:**
```json
{
  "success": false,
  "message": "Only 203 shares available"
}
```

**Insufficient Wallet:**
```json
{
  "success": false,
  "message": "Insufficient wallet balance"
}
```

---

## 🧪 Complete Testing Flow

### **1. Login as User**
```
POST http://localhost:5001/api/auth/login
Body: {
  "email": "user@example.com",
  "password": "Password123!"
}
→ Save user_token
```

### **2. Get Property Details**
```
GET http://localhost:5001/api/admin/properties/{propertyId}

Response includes:
- financials.pricePerShare: SAR 5,000
- financials.availableShares: 203
- financials.minInvestment: SAR 5,000
- investmentTerms.rentalYieldRate: 8%
```

### **3. Check Wallet Balance**
```
GET http://localhost:5001/api/wallet/balance
Authorization: Bearer {{user_token}}

Response: { "balance": 100000 }
```

### **4. Create Investment (Send Units)**
```
POST http://localhost:5001/api/investments
Authorization: Bearer {{user_token}}
Body: {
  "propertyId": "674a1234567890abcdef1234",
  "shares": 10
}

✅ Success! Backend calculates amount = 10 × 5,000 = SAR 50,000
```

### **5. Verify Investment Created**
```
GET http://localhost:5001/api/investments/my-investments
Authorization: Bearer {{user_token}}

Response shows:
- shares: 10
- amount: 50000
- rentalYieldRate: 8 (from property)
- appreciationRate: 5 (from property)
- maturityDate: 2027-11-17
```

---

## 🎯 Why This is Better

### **Old Way (Amount):**
```
1. User selects 10 units in frontend
2. Frontend calculates: 10 × 5,000 = 50,000
3. Frontend sends: { amount: 50000 }
4. Backend calculates: 50,000 ÷ 5,000 = 10 shares
```
❌ Unnecessary conversion, potential rounding errors

### **New Way (Shares):**
```
1. User selects 10 units in frontend
2. Frontend sends: { shares: 10 }
3. Backend calculates: 10 × 5,000 = 50,000
```
✅ Direct, no rounding errors, more intuitive

---

## 📱 Frontend Integration

### **Investment Modal (Already Updated)**

```typescript
// User selects units
const numUnits = 10;

// Send to backend directly
const response = await fetch(`http://localhost:5001/api/investments`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    propertyId: property._id,
    shares: numUnits  // ← Send units directly
  }),
});
```

---

## 🔑 Key Points

✅ **Recommended:** Send `shares` (units) - more intuitive
✅ **Backward Compatible:** Send `amount` - still works
✅ **Backend handles:** Amount calculation, validation, wallet deduction
✅ **Property-specific terms:** Automatically applied from property.investmentTerms
✅ **Validation:** Minimum shares, available shares, wallet balance

---

## 📝 Postman Collection

### **Quick Setup:**

1. **Set Variables:**
   - `base_url`: http://localhost:5001
   - `user_token`: (from login)
   - `property_id`: (from property list)

2. **Create Investment:**
   - Method: POST
   - URL: `{{base_url}}/api/investments`
   - Headers: `Authorization: Bearer {{user_token}}`
   - Body (JSON):
     ```json
     {
       "propertyId": "{{property_id}}",
       "shares": 10
     }
     ```

3. **Test!** 🚀
