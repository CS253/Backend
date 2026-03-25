# Travelly - Backend MVP Specification

## Project Details

**Name:** Travelly  
**Type:** Group Trip Expense Manager  
**Architecture:** REST API (Node.js + Express + PostgreSQL)  
**Target:** College Project (6-8 weeks)

**Purpose:**  
Simplify expense splitting and balance tracking for group trips. Users can create trip groups, add shared expenses, and see who owes whom.

---

## Core Features (MVP)

### 1. Authentication
- User registration (email + password)
- Login with JWT token
- Password reset

### 2. User Profile
- View/update profile
- Save UPI ID for settlements

### 3. Groups
- Create trip group
- Generate invite link
- Join group via link
- View group members
- Delete group

### 4. Expenses
- Add expense with multiple split strategies (equal all, equal selected, custom amounts)
- View expense history with filtering by date and currency
- Delete expense (removes all associated splits)
- View detailed splits for each expense
- Support for multi-currency expenses (grouped by currency)

### 4.1 Expense Management (FR-8)
- **Multiple Split Types (SIMPLIFIED - 2 Types):**
  - **EQUAL**: Divides amount equally among specified participants (or all members if not specified)
  - **CUSTOM**: Specifies exact amounts per member, validates sum equals total
- **Multi-Currency Support:**
  - Default currency set from mobile device location at group creation
  - Expenses can override group currency
  - Currency-specific balance calculations (no conversion)
  - History grouped by currency
  - Balances calculated per currency (USD, INR, etc.)
- **Transfers (SIMPLIFIED):**
  - Record transfers as EQUAL split with single participant
  - Example: User-2 transfers $50 to User-1 by creating expense with type=EQUAL, split=[User-1]
  - No separate Transfer model - integrates seamlessly with balance calculations
- **Individual User Statistics:**
  - Each user can see their personal stats alongside group totals
  - Shows: amount paid, amount owed (their shares), net balance per currency
  - Private to that user - requires userId parameter in query
- **Comprehensive History:**
  - Chronological view of all expenses (including transfers recorded as expenses)
  - Filterable by date range, currency, and user
- **Balance Reporting:**
  - Per-currency balance calculations
  - Shows positive balance (owed to member) and negative (owes money)
  - Includes impact of both expenses and transfers
- **Summary with Individual Context:**
  - Group totals visible to all
  - Individual totals = sum of member's shares in all expenses (per currency)

### 5. Settlements
- View balances (who owes whom)
- Mark payment as completed
- Track settlement history

### 6. Media 
- Upload trip photos
- View group gallery

---

## Backend Tech Stack

### Core
- **Runtime:** Node.js 18+
- **Framework:** Express.js
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Auth:** JWT (jsonwebtoken)
- **Password:** bcryptjs
- **Storage:** Firebase Storage

### NPM Packages
```bash
# Core
npm install express @prisma/client dotenv cors

# Auth & Security
npm install jsonwebtoken bcryptjs express-validator helmet

# Utils
npm install morgan cookie-parser

# Firebase
npm install firebase-admin

# Dev
npm install -D prisma nodemon
```

---

## Database Schema

### Tables (8)

**User**
- id, email, passwordHash, name, upiId, createdAt

**Group**
- id, title, inviteLink, createdBy, currency, createdAt

**GroupMember**
- id, userId, groupId, joinedAt

**Expense** (UPDATED)
- id, title, amount, currency, groupId, paidBy, date, notes, splitType (EQUAL or CUSTOM), createdAt

**ExpenseSplit** (UPDATED)
- id, expenseId, userId, amount

**Settlement**
- id, fromUserId, toUserId, groupId, amount, currency, isPaid, paidAt, createdAt

**Media** (optional)
- id, fileURL, groupId, uploadedBy, createdAt

**Note:** Transfer functionality is achieved through Expense records with EQUAL splitType and single participant (no separate Transfer table needed)

---

## API Endpoints

### Auth
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/reset-password`

### User
- `GET /api/users/profile`
- `PUT /api/users/profile`

### Groups
- `POST /api/groups`
- `GET /api/groups`
- `GET /api/groups/:id`
- `POST /api/groups/join`
- `DELETE /api/groups/:id`

### Expenses
- `POST /api/groups/:groupId/expenses` - Create expense with split configuration (EQUAL or CUSTOM)
- `GET /api/groups/:groupId/expenses` - Get all expenses (with filters: date range, currency, paidBy)
- `GET /api/groups/:groupId/expenses/:expenseId` - Get specific expense with splits
- `DELETE /api/groups/:groupId/expenses/:expenseId` - Delete expense and associated splits

### Reporting & Transfers
- Transfers are recorded as EQUAL split expenses with single participant
- Example: `{"type": "EQUAL", "participants": ["recipient-id"]}` with paidBy sender
- `GET /api/groups/:groupId/balances` - Get all member balances (by currency)
- `GET /api/groups/:groupId/history` - Get complete history (expenses including transfers)
- `GET /api/groups/:groupId/summary` - Get group statistics
- `GET /api/groups/:groupId/summary?userId={id}` - Get group stats + individual user stats (private)

### Settlements
- `GET /api/balances/:groupId`
- `GET /api/settlements/:groupId`
- `POST /api/settlements/:id/mark-paid`

### Media (optional)
- `POST /api/media/:groupId`
- `GET /api/media/:groupId`

---

## Project Structure

```
travelly-backend/
├── prisma/
│   └── schema.prisma
├── src/
│   ├── controllers/
│   ├── routes/
│   ├── middleware/
│   ├── services/
│   └── utils/
├── .env
├── server.js
└── package.json
```

---

## Environment Variables

```env
PORT=5000
DATABASE_URL="postgresql://user:pass@localhost:5432/travelly_db"
JWT_SECRET=your-secret-key
JWT_EXPIRE=24h
FIREBASE_STORAGE_BUCKET=your-bucket.appspot.com
```

---

## Key Business Logic

### Balance Calculation (UPDATED)
1. Group expenses by currency (no conversion)
2. For each currency:
   - Sum all expenses paid by each user (including transfers)
   - Calculate individual's share from expenses
   - Net balance = amount paid - amount owed
3. Generate settlements from debtors to creditors per currency
4. Positive balance = member is owed money, Negative = member owes money

### Split Logic (UPDATED)
- **EQUAL**: Divides expense equally among all group members
- **SELECTED_EQUAL**: Divides equally among selected members only
- **CUSTOM**: Assigns specific amounts to individual members
- Amount per person = total / number of people (with 0.01 rounding tolerance)
- All participants must be group members

### Multi-Currency Handling
- Default currency determined by mobile device location at group creation
- Each expense can override group currency
- Balances calculated separately per currency (no conversion)
- Transfers also support currency specification
- History and reporting organized by currency

---

## What's NOT in MVP (Future Features)

- OTP verification
- Google Sign-In
- Multi-currency conversion (currencies kept separate per FR-8 requirement)
- UPI integration
- Debt simplification algorithm
- Push notifications
- Route optimization
- Recurring expenses