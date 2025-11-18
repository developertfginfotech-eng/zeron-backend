# Complete Postman Testing Guide - Zeron Backend API

**Base URL:** `http://localhost:5001`

---

## 🔐 AUTHENTICATION APIs

### 1. Register User
```
POST http://localhost:5001/api/auth/register
Content-Type: application/json

Body:
{
  "email": "user@example.com",
  "phone": "+966501234567",
  "password": "Password123!",
  "firstName": "John",
  "lastName": "Doe"
}

Response: 201 Created
{
  "success": true,
  "message": "Registration successful",
  "data": {
    "user": { ... },
    "token": "jwt_token_here"
  }
}
```

### 2. Login
```
POST http://localhost:5001/api/auth/login
Content-Type: application/json

Body:
{
  "email": "user@example.com",
  "password": "Password123!"
}

Response: 200 OK
{
  "success": true,
  "token": "jwt_token_here",
  "user": { ... }
}
```

### 3. Forgot Password
```
POST http://localhost:5001/api/auth/forgot-password
Content-Type: application/json

Body:
{
  "email": "user@example.com"
}

Response: 200 OK
{
  "success": true,
  "message": "OTP sent to your email"
}
```

### 4. Verify Reset OTP
```
POST http://localhost:5001/api/auth/verify-reset-otp
Content-Type: application/json

Body:
{
  "email": "user@example.com",
  "otp": "123456"
}

Response: 200 OK
{
  "success": true,
  "message": "OTP verified successfully"
}
```

### 5. Reset Password
```
POST http://localhost:5001/api/auth/reset-password
Content-Type: application/json

Body:
{
  "email": "user@example.com",
  "otp": "123456",
  "newPassword": "NewPassword123!"
}

Response: 200 OK
{
  "success": true,
  "message": "Password reset successful"
}
```

---

## 👥 USER APIs

### 1. Get User Profile
```
GET http://localhost:5001/api/users/profile
Authorization: Bearer {token}

Response: 200 OK
{
  "success": true,
  "data": {
    "user": { ... }
  }
}
```

### 2. Update User Profile
```
PUT http://localhost:5001/api/users/profile
Authorization: Bearer {token}
Content-Type: application/json

Body:
{
  "firstName": "John",
  "lastName": "Updated",
  "phone": "+966501234567"
}

Response: 200 OK
{
  "success": true,
  "message": "Profile updated successfully"
}
```

---

## 🏢 PROPERTY APIs (Public)

### 1. Get All Properties
```
GET http://localhost:5001/api/admin/properties
Query Params (optional):
  - page=1
  - limit=20
  - status=active
  - propertyType=residential

Response: 200 OK
{
  "success": true,
  "data": {
    "properties": [...],
    "pagination": { ... }
  }
}
```

### 2. Get Property by ID
```
GET http://localhost:5001/api/admin/properties/{propertyId}

Response: 200 OK
{
  "success": true,
  "data": {
    "property": { ... }
  }
}
```

---

## 🔑 ADMIN APIs (Requires Admin Authentication)

### 1. Get All Investors
```
GET http://localhost:5001/api/admin/investors
Authorization: Bearer {admin_token}
Query Params (optional):
  - page=1
  - limit=20
  - search=john

Response: 200 OK
{
  "success": true,
  "data": {
    "investors": [...],
    "pagination": { ... },
    "summary": { ... }
  }
}
```

### 2. Get Investor by ID
```
GET http://localhost:5001/api/admin/investors/{investorId}
Authorization: Bearer {admin_token}

Response: 200 OK
{
  "success": true,
  "data": {
    "id": "...",
    "firstName": "...",
    "email": "...",
    "totalInvested": 0,
    "properties": [...]
  }
}
```

### 3. Create Property (Admin/Property Manager Only)
```
POST http://localhost:5001/api/admin/properties
Authorization: Bearer {admin_token}
Content-Type: multipart/form-data

Form Data:
  title: "Luxury Villa in Riyadh"
  description: "Beautiful modern villa"
  propertyType: "residential"
  status: "active"
  location: {"city": "Riyadh", "district": "Al Narjis", "address": "123 Street"}
  financials: {
    "totalValue": 2000000,
    "pricePerShare": 5000,
    "totalShares": 400,
    "availableShares": 400,
    "projectedYield": 8.5
  }
  images: [file1.jpg, file2.jpg]
  otp: "123456"

Note: location and financials must be JSON strings in form-data

Response: 201 Created
{
  "success": true,
  "message": "Property created successfully",
  "data": {
    "property": { ... }
  }
}
```

### 4. Update Property
```
PATCH http://localhost:5001/api/admin/properties/{propertyId}
Authorization: Bearer {admin_token}
Content-Type: multipart/form-data

Form Data:
  title: "Updated Villa Title"
  financials: {"totalValue": 2500000}
  otp: "123456"

Response: 200 OK
{
  "success": true,
  "message": "Property updated successfully"
}
```

### 5. Delete Property
```
DELETE http://localhost:5001/api/admin/properties/{propertyId}
Authorization: Bearer {admin_token}
Content-Type: application/json

Body:
{
  "otp": "123456"
}

Response: 200 OK
{
  "success": true,
  "message": "Property deleted successfully"
}
```

### 6. Get All Transactions (Financial Analyst/Super Admin)
```
GET http://localhost:5001/api/admin/transactions
Authorization: Bearer {admin_token}
Query Params (optional):
  - startDate=2024-01-01
  - endDate=2024-12-31
  - status=completed
  - type=investment
  - limit=50
  - offset=0

Response: 200 OK
{
  "success": true,
  "data": {
    "transactions": [...],
    "pagination": { ... }
  }
}
```

### 7. Get Dashboard Data
```
GET http://localhost:5001/api/admin/dashboard
Authorization: Bearer {admin_token}

Response: 200 OK
{
  "success": true,
  "data": {
    "totalUsers": 100,
    "totalProperties": 50,
    "totalInvestments": 1000000,
    ...
  }
}
```

### 8. Get All Users
```
GET http://localhost:5001/api/admin/users
Authorization: Bearer {admin_token}
Query Params (optional):
  - page=1
  - limit=20
  - status=active
  - kycStatus=approved
  - search=john

Response: 200 OK
{
  "success": true,
  "data": {
    "users": [...],
    "pagination": { ... }
  }
}
```

### 9. Update KYC Status
```
PUT http://localhost:5001/api/admin/users/{userId}/kyc-status
Authorization: Bearer {admin_token}
Content-Type: application/json

Body:
{
  "status": "approved"
}

Response: 200 OK
{
  "success": true,
  "message": "KYC status updated successfully"
}
```

---

## 💰 INVESTMENT APIs

### 1. Calculate Investment Returns
```
POST http://localhost:5001/api/investments/calculate
Content-Type: application/json

Body:
{
  "investmentAmount": 50000
}

Response: 200 OK
{
  "success": true,
  "investmentAmount": 50000,
  "settings": {
    "rentalYieldPercentage": 8,
    "appreciationRatePercentage": 5,
    "maturityPeriodYears": 3
  },
  "returns": {
    "annualRentalIncome": 4000,
    "lockingPeriod": { ... },
    "atMaturity": { ... }
  },
  "earlyWithdrawal": { ... }
}
```

### 2. Create Investment
```
POST http://localhost:5001/api/investments
Authorization: Bearer {token}
Content-Type: application/json

Body (Option 1 - Recommended - Send shares/units):
{
  "propertyId": "property_id_here",
  "shares": 10
}

Body (Option 2 - Backward compatible - Send amount):
{
  "propertyId": "property_id_here",
  "amount": 50000
}

Response: 201 Created
{
  "success": true,
  "data": {
    "investmentId": "...",
    "propertyId": "...",
    "amount": 50000,
    "shares": 10,
    "status": "confirmed",
    "investedAt": "2024-11-17T10:30:00.000Z",
    "message": "Successfully invested SAR 50000 in property"
  }
}
```

### 3. Get User Investments
```
GET http://localhost:5001/api/investments/my-investments
Authorization: Bearer {token}

Response: 200 OK
{
  "success": true,
  "data": {
    "investments": [...]
  }
}
```

### 4. Withdraw Investment
```
POST http://localhost:5001/api/investments/{investmentId}/withdraw
Authorization: Bearer {token}
Content-Type: application/json

Body:
{
  "reason": "Need funds urgently"
}

Response: 200 OK
{
  "success": true,
  "message": "Investment withdrawn successfully",
  "data": {
    "withdrawalAmount": 42500,
    "penalty": 7500
  }
}
```

---

## 💳 WALLET APIs

### 1. Get Wallet Balance
```
GET http://localhost:5001/api/wallet/balance
Authorization: Bearer {token}

Response: 200 OK
{
  "success": true,
  "data": {
    "balance": 10000
  }
}
```

### 2. Get Wallet Transactions
```
GET http://localhost:5001/api/wallet/transactions
Authorization: Bearer {token}
Query Params (optional):
  - limit=20
  - skip=0
  - type=credit

Response: 200 OK
{
  "success": true,
  "data": {
    "transactions": [...],
    "currentBalance": 10000
  }
}
```

### 3. Recharge Wallet
```
POST http://localhost:5001/api/wallet/recharge
Authorization: Bearer {token}
Content-Type: application/json

Body:
{
  "amount": 5000,
  "method": "bank_transfer",
  "description": "Adding funds"
}

Response: 200 OK
{
  "success": true,
  "message": "Wallet recharged successfully"
}
```

### 4. Withdraw from Wallet
```
POST http://localhost:5001/api/wallet/withdraw
Authorization: Bearer {token}
Content-Type: application/json

Body:
{
  "amount": 1000,
  "accountDetails": {
    "bankName": "ABC Bank",
    "accountNumber": "1234567890"
  },
  "description": "Withdrawal request"
}

Response: 200 OK
{
  "success": true,
  "message": "Withdrawal request submitted"
}
```

---

## 📄 KYC APIs

### 1. Submit KYC
```
POST http://localhost:5001/api/kyc/submit
Authorization: Bearer {token}
Content-Type: multipart/form-data

Form Data:
  nationality: "SA"
  dateOfBirth: "1990-01-01"
  idNumber: "1234567890"
  address: "123 Street"
  city: "Riyadh"
  country: "Saudi Arabia"
  occupation: "Engineer"
  income: "10000-20000"
  idDocument: [file]
  addressProof: [file]
  selfie: [file]

Response: 201 Created
{
  "success": true,
  "message": "KYC submitted successfully"
}
```

### 2. Get KYC Status
```
GET http://localhost:5001/api/kyc/status
Authorization: Bearer {token}

Response: 200 OK
{
  "success": true,
  "data": {
    "kycStatus": "pending",
    "kycData": { ... }
  }
}
```

---

## 🧪 TESTING WORKFLOW

### Step 1: Create Admin User
```bash
# First time setup - admin is auto-created from .env
# ADMIN_EMAIL=admin@yourcompany.com
# ADMIN_PASSWORD=AdminSecure123!
```

### Step 2: Login as Admin
```
POST http://localhost:5001/api/auth/login
Body: {
  "email": "admin@yourcompany.com",
  "password": "AdminSecure123!"
}

Save the token from response!
```

### Step 3: Create a Property
```
POST http://localhost:5001/api/admin/properties
Authorization: Bearer {admin_token}
(Use form-data as shown above)
```

### Step 4: Register Regular User
```
POST http://localhost:5001/api/auth/register
(No authorization needed)
```

### Step 5: Login as User
```
POST http://localhost:5001/api/auth/login
Save user token!
```

### Step 6: Calculate Investment
```
POST http://localhost:5001/api/investments/calculate
Body: { "investmentAmount": 50000 }
```

### Step 7: Make Investment
```
POST http://localhost:5001/api/investments
Authorization: Bearer {user_token}
Body: { "propertyId": "...", "shares": 10 }
```

---

## 📝 IMPORTANT NOTES

1. **Authentication Headers:**
   - Always use: `Authorization: Bearer {token}`
   - Get token from login response

2. **Content-Type:**
   - JSON requests: `Content-Type: application/json`
   - File uploads: `Content-Type: multipart/form-data`

3. **OTP for Admin Operations:**
   - Property create/update/delete require OTP
   - OTP is sent to admin's email
   - Check email and add OTP in request body

4. **JSON Fields in Form-Data:**
   - For `location` and `financials` in property creation
   - Send as JSON strings, not objects
   - Example: `location: '{"city":"Riyadh"}'`

5. **Error Responses:**
   - 400: Bad Request (validation failed)
   - 401: Unauthorized (no/invalid token)
   - 403: Forbidden (insufficient permissions)
   - 404: Not Found
   - 500: Server Error

---

## 🔍 Quick Reference Table

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | No | Register user |
| POST | `/api/auth/login` | No | Login |
| GET | `/api/admin/properties` | No | List properties |
| POST | `/api/admin/properties` | Admin | Create property |
| GET | `/api/admin/investors` | Admin | List investors |
| GET | `/api/admin/investors/:id` | Admin | Get investor details |
| POST | `/api/investments/calculate` | No | Calculate returns |
| POST | `/api/investments` | User | Make investment |
| GET | `/api/wallet/balance` | User | Get balance |
| GET | `/api/admin/transactions` | Admin | Get all transactions |
| GET | `/api/wallet/transactions` | User | Get user transactions |

---

## 🎯 Test in This Order:

1. ✅ Register/Login (Get tokens)
2. ✅ Get Properties (Test public access)
3. ✅ Create Property (Admin token + OTP)
4. ✅ Calculate Returns (No auth)
5. ✅ Make Investment (User token)
6. ✅ Get Investors (Admin token)
7. ✅ Get Transactions (Admin/User token)
8. ✅ Wallet Operations (User token)
