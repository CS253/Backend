# Travelly Backend API Documentation

## Base URL
```txt
http://localhost:5000/api
```

## Authentication

Travelly now uses **Firebase Authentication** as the single auth model.

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

There is no longer a public `/trips/*` API surface.

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

### GET `/users/:userId`
Get the authenticated user’s own profile.

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
    "upiId": null,
    "createdAt": "2026-03-26T10:00:00.000Z"
  }
}
```

Errors:
- `403` if requesting another user’s profile
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

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "group-id",
      "name": "Goa Trip",
      "destination": "Goa",
      "coverImage": null,
      "startDate": "2026-04-01T00:00:00.000Z",
      "endDate": "2026-04-05T00:00:00.000Z",
      "tripType": "Leisure",
      "membersCount": 3,
      "createdBy": "user-id",
      "currency": "INR",
      "inviteLink": "invite-..."
    }
  ],
  "meta": {
    "total": 1,
    "page": 1,
    "limit": 10
  }
}
```

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

Response:
```json
{
  "success": true,
  "data": {
    "groupId": "group-id",
    "title": "Goa Trip",
    "destination": "Goa",
    "startDate": "2026-04-01T00:00:00.000Z",
    "endDate": "2026-04-05T00:00:00.000Z",
    "tripType": "Leisure",
    "coverImage": null,
    "currency": "INR",
    "inviteLink": "invite-..."
  },
  "message": "Group created successfully"
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

### GET `/groups/:groupId/members`
List actual and pending members for a group.

Response:
```json
{
  "success": true,
  "members": [
    {
      "id": "user-id",
      "name": "Pranjali",
      "phone": "9876543210",
      "role": "admin",
      "avatarUrl": null,
      "pending": false
    },
    {
      "id": "placeholder-group-1-riya",
      "name": "Riya",
      "phone": "9999999999",
      "role": "member",
      "avatarUrl": null,
      "pending": true
    }
  ]
}
```

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

Only the creator can add members.

### DELETE `/groups/:groupId/members/:memberId`
Remove an actual member or pending participant. Only the creator can remove members.

## Group Photo

These are also under `/groups/*`.

### GET `/groups/:groupId/photo`
### PUT `/groups/:groupId/photo`
Multipart form-data:
- `photo` file

### DELETE `/groups/:groupId/photo`

Upload response:
```json
{
  "success": true,
  "data": {
    "groupId": "group-id",
    "photoUrl": "http://localhost:5000/uploads/groups/group-id/profile/....jpg",
    "hasPhoto": true
  },
  "message": "Group photo added successfully"
}
```

## Media Endpoints

All media routes require Firebase Bearer auth and group membership.

### Media Types
- `photo`: images and videos supported by the gallery flow
- `document`: PDFs, DOC, DOCX, TXT

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
Download/open a photo or video item.

### DELETE `/photos/:id`
Delete one photo item.

### POST `/photos/delete`
Bulk delete:
```json
{
  "ids": ["media-id-1", "media-id-2"]
}
```

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
Generic mixed-media endpoint. Useful for combined attachments views.

### POST `/media/upload`
Generic upload endpoint. Type inferred from MIME type unless route/controller forces a type.

## Expense Endpoints

All expense routes require Firebase Bearer auth and group membership.

### POST `/groups/:groupId/expenses`

Request:
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

Notes:
- `paidBy` is optional; if omitted backend uses authenticated user
- supported split types in current code:
  - `EQUAL`
  - `CUSTOM`

### GET `/groups/:groupId/expenses`
Optional query params:
- `fromDate`
- `toDate`
- `currency`
- `paidBy`

### GET `/groups/:groupId/expenses/:expenseId`
### PUT `/groups/:groupId/expenses/:expenseId`
### DELETE `/groups/:groupId/expenses/:expenseId`

### GET `/groups/:groupId/history`
Chronological expense history.

### GET `/groups/:groupId/summary`
Optional query:
- `userId=<authenticated_user_id>`

If `userId` is present and does not match the authenticated user, backend returns `403`.

## Settlement Endpoints

All settlement routes require Firebase Bearer auth and group membership.

### GET `/groups/:groupId/balances`
Returns raw balances by currency.

### GET `/groups/:groupId/settlements`
If `simplifyDebts` query param is present, returns settlement transactions.

Examples:
```txt
/groups/group-id/settlements?simplifyDebts=false
/groups/group-id/settlements?simplifyDebts=true
```

### POST `/groups/:groupId/settlements/mark-paid`
```json
{
  "fromUserId": "debtor-id",
  "toUserId": "creditor-id",
  "amount": 600,
  "currency": "INR"
}
```

### POST `/groups/:groupId/settlements/request-payment`
Same body shape as `mark-paid`.

### POST `/groups/:groupId/settlements/initiate-payment`
```json
{
  "toUserId": "creditor-id",
  "amount": 600,
  "currency": "INR"
}
```

### GET `/groups/:groupId/payment-history`
Optional query:
- `fromDate`
- `toDate`
- `currency`
- `userId`

If `userId` is present and does not match the authenticated user, backend returns `403`.

### PUT `/groups/:groupId/settings/simplify-debts`
```json
{
  "simplifyDebts": true
}
```

## Error Format

Most endpoints return:
```json
{
  "success": false,
  "error": "Error message"
}
```

Media/group-photo controller errors may return:
```json
{
  "error": "Error message"
}
```

## Important Notes

1. The backend now treats `Group` as the canonical trip + expense-group model.
2. There is no public `/trips` route surface anymore.
3. `fileUrl` is the canonical media URL field.
4. `/photos` keeps `imageUrl` for frontend compatibility but also returns `fileUrl` and `downloadUrl`.
5. Old local email/password auth docs are obsolete. Use Firebase ID tokens.
