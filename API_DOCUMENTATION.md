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

## Endpoints

### 1. Create Expense
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

### 2. Get Group Expenses
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

### 3. Get Specific Expense
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

### 4. Delete Expense
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

### 5. Get Group Balances
**GET** `/groups/:groupId/balances`

Get current balances for all members, organized by currency.

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

### 6. Get Group History
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

### 7. Get Group Summary
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

### Create a Transfer (as EQUAL expense)
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

### Get Group Balances
```bash
curl http://localhost:5000/api/groups/group-123/balances
```

### Get History
```bash
curl http://localhost:5000/api/groups/group-123/history?currency=USD
```

### Get Summary (Group Totals Only)
```bash
curl http://localhost:5000/api/groups/group-123/summary
```

### Get Summary with Individual Stats (Mobile App)
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
- `200`: Success (GET, DELETE)
- `201`: Created (POST)
- `400`: Bad request (validation errors)
- `404`: Not found
- `500`: Server error

---

## Notes

1. **Currency Handling**: Expenses are stored in their specified currency. Balances are calculated per currency, with no automatic conversion.

2. **Split Validation**: 
   - All participants must be group members
   - For CUSTOM splits, amounts must sum to total ± 0.01 (rounding tolerance)
   - For EQUAL with one participant, it simulates a transfer

3. **Date Format**: All dates should be ISO 8601 format (e.g., `2024-03-20T19:30:00Z`)

4. **Decimal Precision**: Amounts are stored and returned with up to 2 decimal places.

5. **Chronological Ordering**: History is sorted by date (descending), then by creation time.

6. **Transfers**: To record a transfer, use an expense with `EQUAL` split type and only one participant. This is simpler and more flexible than maintaining a separate Transfer model.
