# Travelly Backend MVP Specification

## Project Details

**Name:** Travelly  
**Type:** Group Trip Expense Manager  
**Architecture:** REST API (Node.js + Express + PostgreSQL)  
**Target:** College Project

**Purpose:**  
Simplify expense splitting and balance tracking for group trips. Users create trip groups, invite members, add expenses, track balances, upload media, and manage trip settings from the same backend entity.

## Current Architecture Decisions

### Canonical Domain Model
- `Group` is the canonical model for both:
  - trip settings
  - expense group behavior

There is no separate public `Trip` API surface anymore. Trip-style fields live on `Group`:
- `title`
- `destination`
- `startDate`
- `endDate`
- `tripType`
- `coverImage`
- `currency`
- `inviteLink`

### Authentication
- Frontend authentication: **Firebase Auth**
- Backend protected routes: **Firebase ID token verification**
- Backend app user/profile persistence: **PostgreSQL `User` table**

Current flow:
1. user signs up or logs in on frontend with Firebase
2. frontend gets Firebase ID token
3. backend verifies the token
4. backend syncs or creates the matching PostgreSQL user
5. protected routes use resolved `req.userId`

### File Storage
- Current implementation: **local/server filesystem**
- media files stored under:
  - `uploads/groups/<groupId>/photo/...`
  - `uploads/groups/<groupId>/document/...`
  - `uploads/groups/<groupId>/profile/...`
- PostgreSQL stores public `fileUrl` / `photoUrl`

## Core Features

### 1. User Sync & Profile
- Sync Firebase user to PostgreSQL
- Fetch own profile
- Update own profile
- Save UPI ID for settlements

### 2. Groups
- Create group
- Auto-detect default currency from IP if not provided
- Generate invite link
- Join via invite link
- List groups for authenticated user
- View group details
- Update group settings
- Delete group
- View group members
- Add actual or pending members
- Remove actual or pending members
- Group profile photo upload/update/delete

### 3. Expenses
- Add expense
- Equal split
- Custom split
- View group expenses
- View one expense
- Update expense
- Delete expense
- Group history
- Group summary

### 4. Settlements
- View balances
- View settlement transactions
- Mark settlement paid
- Request payment
- Initiate UPI payment link
- View payment history
- Toggle simplify-debts setting

### 5. Media
- Upload gallery media
- Upload documents
- View photo feed
- View document list
- View generic mixed-media list
- Download media/documents
- Delete media/documents

### 6. Route Planner
- Plan route in manual order
- Plan route in optimized order
- Enrich places with opening/closing timing info when available
- Return distance and duration summary via OpenRouteService for optimized plans

## Tech Stack

### Core
- Node.js
- Express.js
- PostgreSQL
- Prisma
- Firebase Admin SDK
- Multer

### Storage
- Local/server filesystem for current implementation

### Key Runtime Packages
- `express`
- `@prisma/client`
- `dotenv`
- `cors`
- `helmet`
- `morgan`
- `cookie-parser`
- `firebase-admin`
- `multer`
- `geoip-lite`

## Database Schema

### User
- `id`
- `firebaseUid`
- `email`
- `passwordHash` optional legacy field
- `name`
- `phoneNumber`
- `upiId`
- `createdAt`

### Group
- `id`
- `title`
- `destination`
- `startDate`
- `endDate`
- `tripType`
- `coverImage`
- `photoUrl`
- `photoPath`
- `inviteLink`
- `inviteLinkStatus`
- `createdBy`
- `currency`
- `preAddedParticipants`
- `simplifyDebts`
- `createdAt`

### GroupMember
- `id`
- `userId`
- `groupId`
- `joinedAt`

### Expense
- `id`
- `title`
- `amount`
- `currency`
- `groupId`
- `paidBy`
- `date`
- `notes`
- `splitType`
- `createdAt`

### ExpenseSplit
- `id`
- `expenseId`
- `userId`
- `amount`

### Settlement
- `id`
- `fromUserId`
- `toUserId`
- `groupId`
- `amount`
- `currency`
- `isPaid`
- `paidAt`
- `createdAt`

### Transaction
- `id`
- `type`
- `groupId`
- `fromUserId`
- `toUserId`
- `amount`
- `currency`
- `date`
- `createdAt`

### Media
- `id`
- `title`
- `fileName`
- `fileUrl`
- `filePath`
- `mimeType`
- `mediaType`
- `sizeBytes`
- `groupId`
- `uploadedBy`
- `createdAt`

## Public API Surfaces

### User
- `POST /api/users`
- `POST /api/users/sync`
- `GET /api/users/me`
- `PUT /api/users/me`
- `GET /api/users/:userId`

### Groups
- `GET /api/groups`
- `POST /api/groups`
- `GET /api/groups/:groupId`
- `PUT /api/groups/:groupId`
- `DELETE /api/groups/:groupId`
- `POST /api/groups/join`
- `POST /api/groups/:groupId/leave`
- `GET /api/groups/:groupId/members`
- `POST /api/groups/:groupId/members`
- `DELETE /api/groups/:groupId/members/:memberId`
- `GET /api/groups/:groupId/photo`
- `PUT /api/groups/:groupId/photo`
- `DELETE /api/groups/:groupId/photo`

### Expenses & Reporting
- `POST /api/groups/:groupId/expenses`
- `GET /api/groups/:groupId/expenses`
- `GET /api/groups/:groupId/expenses/:expenseId`
- `PUT /api/groups/:groupId/expenses/:expenseId`
- `DELETE /api/groups/:groupId/expenses/:expenseId`
- `GET /api/groups/:groupId/history`
- `GET /api/groups/:groupId/summary`

### Settlements
- `GET /api/groups/:groupId/balances`
- `GET /api/groups/:groupId/settlements`
- `POST /api/groups/:groupId/settlements/mark-paid`
- `POST /api/groups/:groupId/settlements/request-payment`
- `POST /api/groups/:groupId/settlements/initiate-payment`
- `GET /api/groups/:groupId/payment-history`
- `PUT /api/groups/:groupId/settings/simplify-debts`

### Media
- `GET /api/photos`
- `POST /api/photos/upload`
- `GET /api/photos/:id/download`
- `DELETE /api/photos/:id`
- `POST /api/photos/delete`

- `GET /api/documents`
- `POST /api/documents/upload`
- `GET /api/documents/:id/download`
- `DELETE /api/documents/:id`
- `POST /api/documents/delete`

- `GET /api/media`
- `POST /api/media/upload`
- `GET /api/media/:id/download`
- `DELETE /api/media/:id`
- `POST /api/media/delete`

### Route Planner
- `POST /api/route-planner/plan`
- `POST /api/route-planner/optimize`
- `POST /api/route-planner/manual-info`

## Environment Variables

```env
PORT=5000
DATABASE_URL="postgresql://user:pass@host:5432/travelly_db"
APP_BASE_URL=http://localhost:5000

FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
ORS_API_KEY=your-openrouteservice-api-key
SERPAPI_KEY=your-serpapi-key
```

## Important Notes

1. `fileUrl` is the canonical media field.
2. `/api/photos` also returns `imageUrl` for frontend compatibility.
3. `/api/photos` and `/api/documents` are specialized route variants over shared media handling.
4. Expense and settlement routes are protected and require group membership.
5. `passwordHash`, `JWT_SECRET`, and related legacy pieces may still exist in repo history/config, but active auth flow is Firebase-based.
6. Prisma migration history in the merged branch is not fully clean; `prisma db push` may be safer than `migrate dev` on fresh teammate setups.

## Firebase-Protected Endpoints

Protected in current code:
- `/api/users/me`
- `/api/users/:userId`
- all `/api/groups/*`
- all `/api/photos/*`
- all `/api/documents/*`
- all `/api/media/*`
- all `/api/route-planner/*`
- all expense routes under `/api/groups/:groupId/*`
- all settlement routes under `/api/groups/:groupId/*`

Public in current code:
- `GET /`
- `POST /api/users`
- `POST /api/users/sync`
