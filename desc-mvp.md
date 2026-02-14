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
- Add expense with equal split (all members or selected)
- View expense history
- Delete expense
- Auto-calculate balances

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

### Tables (7)

**User**
- id, email, passwordHash, name, upiId, createdAt

**Group**
- id, title, inviteLink, createdBy, createdAt

**GroupMember**
- id, userId, groupId, joinedAt

**Expense**
- id, title, amount, groupId, paidBy, date

**ExpenseSplit**
- id, expenseId, userId, amount

**Settlement**
- id, fromUserId, toUserId, groupId, amount, isPaid, paidAt

**Media** (optional)
- id, fileURL, groupId, uploadedBy, createdAt

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
- `POST /api/expenses`
- `GET /api/expenses/:groupId`
- `DELETE /api/expenses/:id`

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

### Balance Calculation
1. Sum all expenses paid by each user
2. Calculate fair share (total expenses / number of members)
3. Net balance = amount paid - fair share
4. Generate settlements from debtors to creditors

### Split Logic
- Equal split among all members
- Equal split among selected members only
- Amount per person = total / number of people

---

## What's NOT in MVP (Future Features)

- OTP verification
- Google Sign-In
- Custom split amounts
- Multi-currency support
- UPI integration
- Debt simplification algorithm
- Push notifications
- Route optimization