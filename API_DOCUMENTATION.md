# Travelly Backend API Documentation

## Base URL
```txt
http://localhost:5000/api
```

## Authentication

Travelly uses **Firebase Authentication** as the active auth model.

Client flow:
1. Sign up or log in with Firebase on the frontend.
2. Get the Firebase ID token from the signed-in user.
3. Send it to backend:
   - in request body as `idToken` for `POST /users` and `POST /users/sync`
   - in headers as `Authorization: Bearer <firebase_id_token>` for protected routes

Protected route behavior:
- backend verifies Firebase ID token
- backend creates or syncs the matching PostgreSQL `User`
- backend resolves `req.userId`

Required server env for protected routes:
```env
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

## Route Organization

Canonical route surfaces:
- `/users/*` for user sync/profile
- `/groups/*` for group + trip settings + member management + group photo
- `/groups/:groupId/*` for expenses, history, summary, balances, settlements
- `/photos/*`, `/documents/*`, `/media/*` for uploads and gallery/document access
- `/route-planner/*` for route planning and place timing enrichment

There is no public `/trips/*` API surface.

## User Endpoints

### POST `/users`
Create or sync an authenticated Firebase user in PostgreSQL.

Request:
```json
{
  "idToken": "FIREBASE_ID_TOKEN",
  "name": "Pranjali",
  "phoneNumber": "9876543210"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "id": "user-id",
    "firebaseUid": "firebase-uid",
    "email": "user@example.com",
    "name": "Pranjali",
    "phoneNumber": "9876543210"
  },
  "message": "User created successfully"
}
```

### POST `/users/sync`
Sync an authenticated Firebase user and claim matching pending participants by phone.

Request:
```json
{
  "idToken": "FIREBASE_ID_TOKEN",
  "name": "Pranjali",
  "phoneNumber": "9876543210"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "id": "user-id",
    "firebaseUid": "firebase-uid",
    "email": "user@example.com",
    "name": "Pranjali",
    "phoneNumber": "9876543210",
    "claimedGroups": 1,
    "claimedParticipants": 1
  },
  "message": "User synced successfully"
}
```

### GET `/users/me`
Get the authenticated user's own profile.

Headers:
```txt
Authorization: Bearer <firebase_id_token>
```

Response:
```json
{
  "success": true,
  "data": {
    "id": "user-id",
    "email": "user@example.com",
    "name": "Pranjali",
    "phoneNumber": "9876543210",
    "upiId": null,
    "createdAt": "2026-03-26T10:00:00.000Z"
  }
}
```

### PUT `/users/me`
Update the authenticated user's own profile.

Headers:
```txt
Authorization: Bearer <firebase_id_token>
```

Request:
```json
{
  "name": "Pranjali Singh",
  "phoneNumber": "9876543210",
  "upiId": "pranjali@upi"
}
```

### GET `/users/:userId`
Compatibility route for fetching the authenticated user's own profile by id.

Headers:
```txt
Authorization: Bearer <firebase_id_token>
```

Errors:
- `403` if requesting another user's profile
- `404` if user not found

## Group Endpoints

All `/groups/*` endpoints require:
```txt
Authorization: Bearer <firebase_id_token>
```

### GET `/groups`
List groups the authenticated user belongs to.

Query params:
- `page` optional
- `limit` optional

### POST `/groups`
Create a group. This endpoint also supports trip-settings fields because `Group` is the canonical trip/group model.

Request:
```json
{
  "title": "Goa Trip",
  "currency": "INR",
  "destination": "Goa",
  "startDate": "2026-04-01T00:00:00.000Z",
  "endDate": "2026-04-05T00:00:00.000Z",
  "tripType": "Leisure",
  "coverImage": null,
  "preAddedParticipants": [
    { "name": "Riya", "phone": "9999999999" }
  ]
}
```

### GET `/groups/:groupId`
Get group details. Only accessible to group members.

### PUT `/groups/:groupId`
Update group details. Only the group creator can update.

Supported fields:
```json
{
  "title": "Goa Trip Updated",
  "currency": "USD",
  "destination": "North Goa",
  "startDate": "2026-04-02T00:00:00.000Z",
  "endDate": "2026-04-06T00:00:00.000Z",
  "tripType": "Friends",
  "coverImage": "https://example.com/cover.jpg"
}
```

### DELETE `/groups/:groupId`
Delete a group permanently. Only the creator can delete.

Request:
```json
{
  "confirmation": true
}
```

### POST `/groups/join`
Join a group using invite link and participant name.

Request:
```json
{
  "inviteLink": "invite-...",
  "participantName": "Riya"
}
```

### POST `/groups/:groupId/leave`
Leave a group using the authenticated member identity.

### GET `/groups/:groupId/members`
List actual and pending members for a group.

### POST `/groups/:groupId/members`
Two supported request shapes:

1. Add an existing user:
```json
{
  "userId": "user-id-2"
}
```

2. Add pending trip/group members by name and phone:
```json
{
  "members": [
    { "name": "Aman", "phone": "8888888888" },
    { "name": "Neha", "phone": "7777777777" }
  ]
}
```

### DELETE `/groups/:groupId/members/:memberId`
Remove an actual member or pending participant. Only the creator can remove members.

## Group Photo

### GET `/groups/:groupId/photo`
### PUT `/groups/:groupId/photo`
Multipart form-data:
- `photo` file

### DELETE `/groups/:groupId/photo`

## Media Endpoints

All media routes require Firebase Bearer auth and group membership.

### GET `/photos?groupId=<groupId>`
Gallery-oriented response.

Example response item:
```json
{
  "id": "media-id",
  "title": "Beach",
  "fileName": "beach.jpg",
  "fileUrl": "http://localhost:5000/uploads/groups/group-id/photo/....jpg",
  "downloadUrl": "http://localhost:5000/uploads/groups/group-id/photo/....jpg",
  "imageUrl": "http://localhost:5000/uploads/groups/group-id/photo/....jpg",
  "mimeType": "image/jpeg",
  "mediaType": "photo",
  "sizeBytes": 12345,
  "groupId": "group-id",
  "createdAt": "2026-03-26T12:00:00.000Z",
  "authorName": "Pranjali"
}
```

### POST `/photos/upload`
Multipart form-data:
- `groupId`
- `title` optional
- one or more `photos[]` files

### GET `/photos/:id/download`
### DELETE `/photos/:id`
### POST `/photos/delete`

### GET `/documents?groupId=<groupId>`
Document-oriented response.

Example response item:
```json
{
  "id": "doc-id",
  "title": "Itinerary",
  "fileName": "itinerary.pdf",
  "fileUrl": "http://localhost:5000/uploads/groups/group-id/document/....pdf",
  "documentUrl": "http://localhost:5000/uploads/groups/group-id/document/....pdf",
  "downloadUrl": "http://localhost:5000/uploads/groups/group-id/document/....pdf",
  "mimeType": "application/pdf",
  "extension": "pdf",
  "mediaType": "document",
  "sizeBytes": 12345,
  "groupId": "group-id",
  "createdAt": "2026-03-26T12:00:00.000Z",
  "authorName": "Pranjali"
}
```

### POST `/documents/upload`
Multipart form-data:
- `groupId`
- `title` optional
- file upload

### GET `/documents/:id/download`
### DELETE `/documents/:id`
### POST `/documents/delete`

### GET `/media?groupId=<groupId>`
Generic mixed-media endpoint.

### POST `/media/upload`
Generic upload endpoint.

### GET `/media/:id/download`
### DELETE `/media/:id`
### POST `/media/delete`

## Route Planner Endpoints

These endpoints require Firebase Bearer auth.

### POST `/route-planner/plan`
Unified route-planning endpoint for frontend use.

Request:
```json
{
  "departureTime": "15:05",
  "optimized": true,
  "start": {
    "name": "Hotel",
    "lat": 26.4499,
    "lng": 80.3319
  },
  "destinations": [
    {
      "name": "Allen Forest Zoo",
      "lat": 26.4784,
      "lng": 80.2718
    }
  ]
}
```

Behavior:
- `optimized: true` requires `start` and returns nearest-neighbor ordering plus ORS summary
- `optimized: false` preserves incoming destination order

### POST `/route-planner/optimize`
Legacy optimized-order endpoint.

### POST `/route-planner/manual-info`
Legacy manual-order endpoint.

## Expense Endpoints

All expense routes require Firebase Bearer auth and group membership.

### POST `/groups/:groupId/expenses`
```json
{
  "title": "Dinner",
  "amount": 1200,
  "currency": "INR",
  "notes": "Team dinner",
  "split": {
    "type": "EQUAL",
    "participants": ["user-id-1", "user-id-2"]
  }
}
```

### GET `/groups/:groupId/expenses`
### GET `/groups/:groupId/expenses/:expenseId`
### PUT `/groups/:groupId/expenses/:expenseId`
### DELETE `/groups/:groupId/expenses/:expenseId`
### GET `/groups/:groupId/history`
### GET `/groups/:groupId/summary`

## Settlement Endpoints

All settlement routes require Firebase Bearer auth and group membership.

### GET `/groups/:groupId/balances`
### GET `/groups/:groupId/settlements`
### POST `/groups/:groupId/settlements/mark-paid`
### POST `/groups/:groupId/settlements/request-payment`
### POST `/groups/:groupId/settlements/initiate-payment`
### GET `/groups/:groupId/payment-history`
### PUT `/groups/:groupId/settings/simplify-debts`

## Error Format

Most endpoints return:
```json
{
  "success": false,
  "error": "Error message"
}
```

## Firebase-Protected Surfaces

Protected by Firebase Bearer auth:
- `/users/me`
- `/users/:userId`
- all `/groups/*`
- all `/photos/*`
- all `/documents/*`
- all `/media/*`
- all `/route-planner/*`
- all expense routes under `/groups/:groupId/*`
- all settlement routes under `/groups/:groupId/*`

Not Firebase-protected in current code:
- `/`
- `POST /users`
- `POST /users/sync`

## Important Notes

1. The backend now treats `Group` as the canonical trip + expense-group model.
2. There is no public `/trips` route surface anymore.
3. `fileUrl` is the canonical media URL field.
4. `/photos` keeps `imageUrl` for frontend compatibility but also returns `fileUrl` and `downloadUrl`.
5. Old local email/password auth docs are obsolete. Use Firebase ID tokens.
