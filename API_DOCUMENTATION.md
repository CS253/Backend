# Expense Management API Documentation

## Base URL
```
http://localhost:5000/api
```

## Key Concept: Transfers as Expenses

**Transfers are not a separate entity.** Instead, record a transfer as an **EQUAL expense with one participant**.

To transfer $50 from User-2 to User-1:
```json
{
  "title": "Reimbursement - Gas Payment",
  "amount": 50,
  "paidBy": "user-id-2",
  "currency": "USD",
  "split": {
    "type": "EQUAL",
    "participants": ["user-id-1"]
  }
}
```

This achieves the same effect without needing a separate Transfer model.

---

## API Endpoints

### User Management

#### 1. Create User
**POST** `/users`

Create a new user account.

**Request Body:**
```json
{
  "email": "john@example.com",
  "name": "John Doe",
  "password": "secure_password_123"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "userId": "user-123",
    "email": "john@example.com",
    "name": "John Doe"
  },
  "message": "User created successfully"
}
```

**Error Cases:**
- `400`: Email and password are required
- `400`: User with this email already exists

---

#### 2. Get User Details
**GET** `/users/:userId`

Retrieve user profile information.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "user-123",
    "email": "john@example.com",
    "name": "John Doe",
    "upiId": "john@upi",
    "createdAt": "2024-03-20T10:00:00Z"
  }
}
```

**Error Cases:**
- `404`: User not found

---

### Group Management

#### 3. Create Group
**POST** `/groups`

Create a new expense group and add the creator as a member.

**Request Body:**
```json
{
  "title": "Europe Trip 2024",
  "currency": "USD",
  "createdBy": "user-123"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "groupId": "group-123",
    "title": "Europe Trip 2024",
    "currency": "USD",
    "inviteLink": "invite-1234567890-abcd123"
  },
  "message": "Group created successfully"
}
```

**Error Cases:**
- `400`: Title, currency, and createdBy are required

---

#### 4. Get Group Details
**GET** `/groups/:groupId`

Get group information including all members.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "group-123",
    "title": "Europe Trip 2024",
    "currency": "USD",
    "createdBy": "user-123",
    "createdAt": "2024-03-20T10:00:00Z",
    "members": [
      {
        "id": "member-1",
        "userId": "user-123",
        "groupId": "group-123",
        "user": {
          "id": "user-123",
          "name": "John Doe",
          "email": "john@example.com"
        }
      },
      {
        "id": "member-2",
        "userId": "user-456",
        "groupId": "group-123",
        "user": {
          "id": "user-456",
          "name": "Jane Smith",
          "email": "jane@example.com"
        }
      }
    ]
  }
}
```

**Error Cases:**
- `404`: Group not found

---

#### 5. Add Member to Group
**POST** `/groups/:groupId/members`

Add an existing user to a group.

**Request Body:**
```json
{
  "userId": "user-456"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "memberId": "member-2",
    "userId": "user-456",
    "groupId": "group-123"
  },
  "message": "User added to group successfully"
}
```

**Error Cases:**
- `400`: userId is required
- `404`: Group not found
- `404`: User not found
- `400`: User is already a member of this group

---

#### 6. Update Group
**PUT** `/groups/:groupId`

Update group title and/or currency.

**Request Body:**
```json
{
  "title": "Europe Trip 2024 - Updated",
  "currency": "EUR"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "group-123",
    "title": "Europe Trip 2024 - Updated",
    "currency": "EUR",
    "members": [...]
  },
  "message": "Group updated successfully"
}
```

**Error Cases:**
- `400`: At least one of title or currency is required
- `404`: Group not found

---

## Expense Management

#### 7. Create Expense

## Expense Management

#### 7. Create Expense
**POST** `/groups/:groupId/expenses`

Create a new expense with automatic split calculation.

**Request Body:**
```json
{
  "title": "Dinner at restaurant",
  "amount": 120.50,
  "paidBy": "user-id-1",
  "currency": "USD",
  "date": "2024-03-20T19:30:00Z",
  "notes": "Birthday dinner",
  "split": {
    "type": "EQUAL",
    "participants": ["user-id-1", "user-id-2", "user-id-3", "user-id-4"]
  }
}
```

**Split Types:**
- `EQUAL`: Divides equally among specified participants (or all group members if participants not specified)
- `CUSTOM`: Assigns specific amounts to each participant

**Example with EQUAL (selected participants):**
```json
{
  "title": "Drinks",
  "amount": 60,
  "paidBy": "user-id-1",
  "currency": "INR",
  "split": {
    "type": "EQUAL",
    "participants": ["user-id-1", "user-id-2"]
  }
}
```

**Example with CUSTOM:**
```json
{
  "title": "Group gift",
  "amount": 500,
  "paidBy": "user-id-1",
  "currency": "USD",
  "split": {
    "type": "CUSTOM",
    "splits": [
      { "userId": "user-id-1", "amount": 200 },
      { "userId": "user-id-2", "amount": 150 },
      { "userId": "user-id-3", "amount": 150 }
    ]
  }
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "exp-123",
    "title": "Dinner at restaurant",
    "amount": 120.50,
    "currency": "USD",
    "groupId": "group-123",
    "paidBy": "user-id-1",
    "date": "2024-03-20T19:30:00Z",
    "notes": "Birthday dinner",
    "splitType": "EQUAL",
    "splits": [
      {
        "id": "split-1",
        "expenseId": "exp-123",
        "userId": "user-id-1",
        "amount": 30.13
      },
      {
        "id": "split-2",
        "expenseId": "exp-123",
        "userId": "user-id-2",
        "amount": 30.13
      },
      {
        "id": "split-3",
        "expenseId": "exp-123",
        "userId": "user-id-3",
        "amount": 30.12
      },
      {
        "id": "split-4",
        "expenseId": "exp-123",
        "userId": "user-id-4",
        "amount": 30.12
      }
    ],
    "createdAt": "2024-03-20T19:35:00Z"
  },
  "message": "Expense created successfully"
}
```

---

#### 8. Get Group Expenses
**GET** `/groups/:groupId/expenses`

Retrieve all expenses for a group with optional filters.

**Query Parameters:**
- `fromDate` (optional): Filter expenses from this date (ISO format)
- `toDate` (optional): Filter expenses until this date (ISO format)
- `currency` (optional): Filter by currency code
- `paidBy` (optional): Filter by payer user ID

**Example URL:**
```
/groups/group-123/expenses?currency=USD&fromDate=2024-03-01T00:00:00Z
```

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "exp-123",
      "title": "Dinner",
      "amount": 120.50,
      "currency": "USD",
      "groupId": "group-123",
      "paidBy": "user-id-1",
      "payer": {
        "id": "user-id-1",
        "name": "John Doe",
        "email": "john@example.com"
      },
      "date": "2024-03-20T19:30:00Z",
      "notes": "Birthday dinner",
      "splitType": "EQUAL",
      "splits": [...],
      "createdAt": "2024-03-20T19:35:00Z"
    }
  ],
  "count": 1
}
```

---

#### 9. Get Specific Expense
**GET** `/groups/:groupId/expenses/:expenseId`

Get a single expense with detailed split information.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "exp-123",
    "title": "Dinner",
    "amount": 120.50,
    "currency": "USD",
    "groupId": "group-123",
    "paidBy": "user-id-1",
    "payer": {
      "id": "user-id-1",
      "name": "John Doe",
      "email": "john@example.com"
    },
    "date": "2024-03-20T19:30:00Z",
    "notes": "Birthday dinner",
    "splitType": "EQUAL",
    "splits": [
      {
        "id": "split-1",
        "expenseId": "exp-123",
        "userId": "user-id-1",
        "amount": 30.13,
        "user": {
          "id": "user-id-1",
          "name": "John Doe",
          "email": "john@example.com"
        }
      },
      {
        "id": "split-2",
        "expenseId": "exp-123",
        "userId": "user-id-2",
        "amount": 30.13,
        "user": {
          "id": "user-id-2",
          "name": "Jane Smith",
          "email": "jane@example.com"
        }
      }
    ],
    "createdAt": "2024-03-20T19:35:00Z"
  }
}
```

---

#### 10. Update Expense
**PUT** `/groups/:groupId/expenses/:expenseId`

Update an expense and recalculate its splits. All fields are optional - only provided fields will be updated.

**Request Body** (all fields optional):
```json
{
  "title": "Updated Dinner",
  "amount": 150.00,
  "paidBy": "user-id-2",
  "currency": "USD",
  "date": "2024-03-20T20:00:00Z",
  "notes": "Updated notes",
  "split": {
    "type": "CUSTOM",
    "splits": [
      { "userId": "user-id-1", "amount": 75 },
      { "userId": "user-id-2", "amount": 75 }
    ]
  }
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "exp-123",
    "title": "Updated Dinner",
    "amount": 150.00,
    "currency": "USD",
    "groupId": "group-123",
    "paidBy": "user-id-2",
    "date": "2024-03-20T20:00:00Z",
    "notes": "Updated notes",
    "splitType": "CUSTOM",
    "splits": [
      {
        "id": "split-1",
        "expenseId": "exp-123",
        "userId": "user-id-1",
        "amount": 75.00
      },
      {
        "id": "split-2",
        "expenseId": "exp-123",
        "userId": "user-id-2",
        "amount": 75.00
      }
    ],
    "updatedAt": "2024-03-20T20:05:00Z"
  },
  "message": "Expense updated successfully"
}
```

**Error Cases:**
- `400`: Invalid amount format
- `400`: CUSTOM splits don't sum to total amount
- `400`: Split participants are not group members
- `404`: Expense not found

---

#### 11. Delete Expense
**DELETE** `/groups/:groupId/expenses/:expenseId`

Remove an expense and all its associated splits.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "exp-123",
    "title": "Dinner",
    "amount": 120.50
  },
  "message": "Expense deleted successfully"
}
```

---

## Settlement & Balance Management

#### 12. Get Group Balances
**GET** `/groups/:groupId/balances`

Get current balances for all members, organized by currency. Shows what each user has paid vs. owed.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "USD": {
      "user-id-1": {
        "paid": 150.50,
        "owed": 100.00,
        "balance": 50.50
      },
      "user-id-2": {
        "paid": 50.00,
        "owed": 100.25,
        "balance": -50.25
      },
      "user-id-3": {
        "paid": 20.00,
        "owed": 30.00,
        "balance": -10.00
      }
    },
    "INR": {
      "user-id-1": {
        "paid": 5000,
        "owed": 3000,
        "balance": 2000
      },
      "user-id-2": {
        "paid": 0,
        "owed": 5000,
        "balance": -5000
      }
    }
  },
  "message": "Balances organized by currency. Positive balance = owed money, Negative = owes money"
}
```

**Balance Interpretation:**
- **Positive balance**: User is owed money
- **Negative balance**: User owes money
- Balances are kept separate per currency (no conversion)

---

#### 13. Get Group Settlements
**GET** `/groups/:groupId/settlements`

Alias for `/balances` endpoint. Returns the same balances information but can optionally return simplified settlement transactions.

**Query Parameters:**
- `simplifyDebts` (optional): true/false - if provided, returns settlement transactions instead of raw balances
  - `false`: Netting algorithm - nets bidirectional flows between users
  - `true`: Greedy algorithm - minimizes total number of transactions

**Example URLs:**
```
/groups/group-123/settlements                    (same as /balances)
/groups/group-123/settlements?simplifyDebts=false  (netting algorithm)
/groups/group-123/settlements?simplifyDebts=true   (greedy algorithm - minimal transactions)
```

**Response (200) - without simplifyDebts (Raw Balances):**
```json
{
  "success": true,
  "data": {
    "USD": {
      "user-id-1": {
        "paid": 150.50,
        "owed": 100.00,
        "balance": 50.50
      },
      "user-id-2": {
        "paid": 50.00,
        "owed": 100.25,
        "balance": -50.25
      }
    }
  }
}
```

**Response (200) - with simplifyDebts=false (Netting Algorithm):**
```json
{
  "success": true,
  "data": {
    "USD": [
      {
        "fromUserId": "user-id-2",
        "fromUserName": "Jane Smith",
        "toUserId": "user-id-1",
        "toUserName": "John Doe",
        "amount": 50.25,
        "currency": "USD"
      },
      {
        "fromUserId": "user-id-3",
        "fromUserName": "Bob Johnson",
        "toUserId": "user-id-1",
        "toUserName": "John Doe",
        "amount": 10.00,
        "currency": "USD"
      }
    ]
  },
  "algorithm": "DINICS",
  "message": "Settlements calculated"
}
```

**Response (200) - with simplifyDebts=true (Greedy Algorithm):**
```json
{
  "success": true,
  "data": {
    "USD": [
      {
        "fromUserId": "user-id-2",
        "fromUserName": "Jane Smith",
        "toUserId": "user-id-1",
        "toUserName": "John Doe",
        "amount": 50.25,
        "currency": "USD"
      },
      {
        "fromUserId": "user-id-3",
        "fromUserName": "Bob Johnson",
        "toUserId": "user-id-1",
        "toUserName": "John Doe",
        "amount": 10.00,
        "currency": "USD"
      }
    ]
  },
  "algorithm": "GREEDY",
  "message": "Settlements calculated"
}
```

---

#### 14. Mark Settlement as Paid
**POST** `/groups/:groupId/settlements/mark-paid`

Record that a settlement has been paid and create a reimbursement transaction.

**Request Body:**
```json
{
  "fromUserId": "user-id-2",
  "toUserId": "user-id-1",
  "amount": 50.25,
  "currency": "USD"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "trans-456",
    "fromUserId": "user-id-2",
    "toUserId": "user-id-1",
    "amount": 50.25,
    "currency": "USD",
    "groupId": "group-123",
    "type": "REIMBURSEMENT",
    "createdAt": "2024-03-21T10:30:00Z"
  },
  "message": "Settlement marked as paid. Reimbursement transaction recorded."
}
```

**Error Cases:**
- `400`: fromUserId, toUserId, amount, and currency are required
- `404`: Group not found

---

#### 15. Request Payment
**POST** `/groups/:groupId/settlements/request-payment`

Send a payment reminder notification to a debtor.

**Request Body:**
```json
{
  "fromUserId": "user-id-2",
  "toUserId": "user-id-1",
  "amount": 50.25,
  "currency": "USD"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "fromUserId": "user-id-2",
    "toUserId": "user-id-1",
    "amount": 50.25,
    "currency": "USD",
    "requestedAt": "2024-03-21T10:30:00Z"
  },
  "message": "Payment request sent to debtor (notification would be sent in production)"
}
```

**Error Cases:**
- `400`: fromUserId, toUserId, amount, and currency are required
- `404`: Group not found

---

#### 16. Initiate Payment
**POST** `/groups/:groupId/settlements/initiate-payment`

Generate a UPI payment link for settling a debt. Returns a deep link to UPI app.

**Request Body:**
```json
{
  "toUserId": "user-id-1",
  "amount": 50.25,
  "currency": "USD"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "paymentLink": "upi://pay?pa=john@upi&pn=John Doe&am=50.25&tn=Travelly%20Reimbursement",
    "upiId": "john@upi",
    "recipientName": "John Doe",
    "amount": 50.25,
    "currency": "USD"
  },
  "message": "Payment link generated. Redirect to UPI app."
}
```

**Error Cases:**
- `400`: toUserId, amount, and currency are required
- `400`: Recipient does not have UPI ID saved

---

#### 17. Get Payment History
**GET** `/groups/:groupId/payment-history`

Get history of all reimbursement transactions in the group.

**Query Parameters:**
- `fromDate` (optional): Filter from this date (ISO format)
- `toDate` (optional): Filter until this date (ISO format)
- `currency` (optional): Filter by currency
- `userId` (optional): Filter by user involvement (payer or recipient)

**Example URL:**
```
/groups/group-123/payment-history?currency=USD&fromDate=2024-03-01T00:00:00Z
```

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "trans-456",
      "fromUserId": "user-id-2",
      "toUserId": "user-id-1",
      "amount": 50.25,
      "currency": "USD",
      "groupId": "group-123",
      "createdAt": "2024-03-21T10:30:00Z",
      "fromUser": {
        "id": "user-id-2",
        "name": "Jane Smith",
        "email": "jane@example.com"
      },
      "toUser": {
        "id": "user-id-1",
        "name": "John Doe",
        "email": "john@example.com"
      }
    }
  ],
  "count": 1
}
```

---

#### 18. Update Simplify Debts Setting
**PUT** `/groups/:groupId/settings/simplify-debts`

Toggle the settlement algorithm used for the group.

**Request Body:**
```json
{
  "simplifyDebts": true
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "groupId": "group-123",
    "simplifyDebts": true
  },
  "message": "Settlement algorithm: GREEDY (minimizes transactions)"
}
```

**Settings:**
- `true`: GREEDY algorithm - minimizes number of settlement transactions
- `false`: DINICS algorithm - preserves original debtor-creditor relationships

**Error Cases:**
- `400`: simplifyDebts must be a boolean

---

## Reporting & History

#### 19. Get Group History
**GET** `/groups/:groupId/history`

Get complete chronological history of all expenses (including transfers recorded as EQUAL expenses with one participant).

**Query Parameters:**
- `fromDate` (optional): Filter from this date
- `toDate` (optional): Filter until this date
- `currency` (optional): Filter by currency
- `userId` (optional): Filter by user involvement (payer or split participant)

**Example URL:**
```
/groups/group-123/history?fromDate=2024-03-01T00:00:00Z&currency=USD
```

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "exp-123",
      "type": "EXPENSE",
      "title": "Reimbursement - Gas",
      "amount": 50.00,
      "currency": "USD",
      "date": "2024-03-21T10:00:00Z",
      "createdAt": "2024-03-21T10:05:00Z",
      "payer": {
        "id": "user-id-2",
        "name": "Jane Smith"
      },
      "splits": [
        {
          "id": "split-1",
          "userId": "user-id-1",
          "amount": 50.00,
          "user": {
            "id": "user-id-1",
            "name": "John Doe"
          }
        }
      ],
      "notes": "Transfer recorded as EQUAL expense (only one participant)"
    },
    {
      "id": "exp-122",
      "type": "EXPENSE",
      "title": "Dinner at restaurant",
      "amount": 120.50,
      "currency": "USD",
      "date": "2024-03-20T19:30:00Z",
      "createdAt": "2024-03-20T19:35:00Z",
      "payer": {
        "id": "user-id-1",
        "name": "John Doe"
      },
      "splits": [
        {
          "id": "split-1",
          "userId": "user-id-1",
          "amount": 30.13,
          "user": {
            "id": "user-id-1",
            "name": "John Doe"
          }
        },
        {
          "id": "split-2",
          "userId": "user-id-2",
          "amount": 30.13,
          "user": {
            "id": "user-id-2",
            "name": "Jane Smith"
          }
        }
      ],
      "notes": "Birthday dinner"
    }
  ],
  "count": 2
}
```

---

#### 20. Get Group Summary
**GET** `/groups/:groupId/summary`

Get overall statistics and summary for a group. Optionally include individual user stats.

**PRIVACY & SECURITY:**
- **Group totals** (`totalExpensesByPaymentCurrency`): Visible to all group members without authentication
- **Individual stats**: Only returned when `userId` is explicitly provided in query params
- **Production Implementation**: Should require JWT authentication to verify requesting user matches the `userId` parameter (currently not enforced for testing)

**Query Parameters:**
- `userId` (optional): Include individual stats for this specific user (their paid, owed, total expenses, and net balance per currency)

**Example URLs:**
```
/groups/group-123/summary                        (Group totals only - visible to everyone)
/groups/group-123/summary?userId=user-id-1       (Group totals + user-id-1's individual stats)
```

**Response (200) - Without userId:**
```json
{
  "success": true,
  "data": {
    "groupId": "group-123",
    "groupTitle": "Europe Trip 2024",
    "currency": "USD",
    "memberCount": 4,
    "expenseCount": 12,
    "totalExpensesByPaymentCurrency": {
      "USD": 1250.50,
      "INR": 8000.00
    }
  }
}
```

**Response (200) - With userId (for mobile app - individual user only):**
```json
{
  "success": true,
  "data": {
    "groupId": "group-123",
    "groupTitle": "Europe Trip 2024",
    "currency": "USD",
    "memberCount": 4,
    "expenseCount": 12,
    "totalExpensesByPaymentCurrency": {
      "USD": 1250.50,
      "INR": 8000.00
    },
    "individual": {
      "userId": "user-id-1",
      "totalExpensesByPaymentCurrency": {
        "USD": 700.00,
        "INR": 4500.00
      },
      "paid": {
        "USD": 450.00,
        "INR": 3000.00
      },
      "owed": {
        "USD": 250.00,
        "INR": 1500.00
      },
      "balance": {
        "USD": 200.00,
        "INR": 1500.00
      }
    }
  }
}
```

**Individual Stats Explanation:**
- `totalExpensesByPaymentCurrency`: **Sum of user's shares** in all expenses (what they owe to the group)
- `paid`: **Total amount** the user paid for group expenses (per currency)
- `owed`: **Sum of user's shares** in all group expenses (same as totalExpensesByPaymentCurrency)
- `balance`: **Net position** (paid - owed) per currency
  - Positive = user is owed money (they overpaid)
  - Negative = user owes money (they underpaid)

---

## Testing with cURL

### Create User
```bash
curl -X POST http://localhost:5000/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "name": "John Doe",
    "password": "secure_password_123"
  }'
```

### Create Group
```bash
curl -X POST http://localhost:5000/api/groups \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Europe Trip 2024",
    "currency": "USD",
    "createdBy": "user-123"
  }'
```

### Add Member to Group
```bash
curl -X POST http://localhost:5000/api/groups/group-123/members \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-456"
  }'
```

### Create an Expense (EQUAL split)
```bash
curl -X POST http://localhost:5000/api/groups/group-123/expenses \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Lunch",
    "amount": 50,
    "paidBy": "user-1",
    "currency": "USD",
    "split": {
      "type": "EQUAL"
    }
  }'
```

### Create a Transfer (as EQUAL expense with one participant)
```bash
curl -X POST http://localhost:5000/api/groups/group-123/expenses \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Reimbursement - Gas",
    "amount": 25,
    "paidBy": "user-2",
    "currency": "USD",
    "split": {
      "type": "EQUAL",
      "participants": ["user-1"]
    }
  }'
```

### Update an Expense
```bash
curl -X PUT http://localhost:5000/api/groups/group-123/expenses/exp-123 \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Updated Lunch",
    "amount": 75,
    "split": {
      "type": "EQUAL",
      "participants": ["user-1", "user-2"]
    }
  }'
```

### Get Group Expenses
```bash
curl http://localhost:5000/api/groups/group-123/expenses
```

### Get Specific Expense
```bash
curl http://localhost:5000/api/groups/group-123/expenses/exp-123
```

### Delete Expense
```bash
curl -X DELETE http://localhost:5000/api/groups/group-123/expenses/exp-123
```

### Get Group Balances
```bash
curl http://localhost:5000/api/groups/group-123/balances
```

### Get Settlements with Netting Algorithm
```bash
curl http://localhost:5000/api/groups/group-123/settlements?simplifyDebts=false
```

### Get Settlements with Greedy Algorithm
```bash
curl http://localhost:5000/api/groups/group-123/settlements?simplifyDebts=true
```

### Mark Settlement as Paid
```bash
curl -X POST http://localhost:5000/api/groups/group-123/settlements/mark-paid \
  -H "Content-Type: application/json" \
  -d '{
    "fromUserId": "user-2",
    "toUserId": "user-1",
    "amount": 50.25,
    "currency": "USD"
  }'
```

### Get Payment History
```bash
curl http://localhost:5000/api/groups/group-123/payment-history?currency=USD
```

### Get Group History
```bash
curl http://localhost:5000/api/groups/group-123/history?currency=USD
```

### Get Group Summary (Group Totals Only)
```bash
curl http://localhost:5000/api/groups/group-123/summary
```

### Get Group Summary with Individual Stats
```bash
curl http://localhost:5000/api/groups/group-123/summary?userId=user-id-1
```

---

## Error Handling

All endpoints return errors in the following format:

```json
{
  "success": false,
  "error": "Error message describing what went wrong"
}
```

Common HTTP Status Codes:
- `200`: Success (GET, PUT, DELETE)
- `201`: Created (POST for resource creation)
- `400`: Bad request (validation errors)
- `404`: Not found
- `500`: Server error

---

## API Summary Table

| # | Method | Endpoint | Description |
|---|--------|----------|-------------|
| 1 | POST | `/users` | Create a new user |
| 2 | GET | `/users/:userId` | Get user details |
| 3 | POST | `/groups` | Create a new group |
| 4 | GET | `/groups/:groupId` | Get group details |
| 5 | POST | `/groups/:groupId/members` | Add member to group |
| 6 | PUT | `/groups/:groupId` | Update group |
| 7 | POST | `/groups/:groupId/expenses` | Create expense |
| 8 | GET | `/groups/:groupId/expenses` | List all expenses |
| 9 | GET | `/groups/:groupId/expenses/:expenseId` | Get expense details |
| 10 | PUT | `/groups/:groupId/expenses/:expenseId` | Update expense |
| 11 | DELETE | `/groups/:groupId/expenses/:expenseId` | Delete expense |
| 12 | GET | `/groups/:groupId/balances` | Get group balances |
| 13 | GET | `/groups/:groupId/settlements` | Get settlements (alias for balances) |
| 14 | POST | `/groups/:groupId/settlements/mark-paid` | Mark settlement as paid |
| 15 | POST | `/groups/:groupId/settlements/request-payment` | Request payment |
| 16 | POST | `/groups/:groupId/settlements/initiate-payment` | Generate UPI payment link |
| 17 | GET | `/groups/:groupId/payment-history` | Get payment history |
| 18 | PUT | `/groups/:groupId/settings/simplify-debts` | Update settlement algorithm |
| 19 | GET | `/groups/:groupId/history` | Get expense history |
| 20 | GET | `/groups/:groupId/summary` | Get group summary |

---

## Notes

1. **Currency Handling**: Expenses are stored in their specified currency. Balances are calculated per currency, with no automatic conversion.

2. **Split Validation**: 
   - All participants must be group members
   - For CUSTOM splits, amounts must sum to total ± 0.01 (rounding tolerance)
   - For EQUAL with one participant, it simulates a transfer/reimbursement

3. **Date Format**: All dates should be ISO 8601 format (e.g., `2024-03-20T19:30:00Z`)

4. **Decimal Precision**: Amounts are stored and returned with up to 2 decimal places.

5. **Chronological Ordering**: History is sorted by date (descending), then by creation time.

6. **Transfers**: To record a transfer, use an expense with `EQUAL` split type and only one participant. This is simpler and more flexible than maintaining a separate Transfer model.

7. **Settlement Algorithms**:
   - **Netting (simplifyDebts=false)**: Nets bidirectional flows between each user pair. A owes B ₹20 + B owes A ₹100 becomes A receives ₹80 from B
   - **Greedy (simplifyDebts=true)**: Matches net debtors to net creditors, minimizing total transactions

8. **Update Operations**: All PUT endpoints support partial updates - only provided fields will be updated, others remain unchanged.
