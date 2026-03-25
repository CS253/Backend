const express = require('express');
const router = express.Router();
const expenseService = require('../services/expenseService');
const reportingService = require('../services/reportingService');

// ===== EXPENSE ROUTES =====

/**
 * POST /groups/:groupId/expenses
 * Create a new expense with split configuration
 */
router.post('/groups/:groupId/expenses', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { title, amount, paidBy, currency, split, notes, date } = req.body;

    const expense = await expenseService.createExpense({
      groupId,
      title,
      amount: parseFloat(amount),
      paidBy,
      currency,
      split,
      notes,
      date,
    });

    res.status(201).json({
      success: true,
      data: expense,
      message: 'Expense created successfully',
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /groups/:groupId/expenses
 * Get all expenses for a group with optional filters
 */
router.get('/groups/:groupId/expenses', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { fromDate, toDate, currency, paidBy } = req.query;

    const expenses = await expenseService.getGroupExpenses(groupId, {
      fromDate,
      toDate,
      currency,
      userId: paidBy,
    });

    res.json({
      success: true,
      data: expenses,
      count: expenses.length,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /groups/:groupId/expenses/:expenseId
 * Get a specific expense with its splits
 */
router.get('/groups/:groupId/expenses/:expenseId', async (req, res) => {
  try {
    const { expenseId } = req.params;

    const expense = await expenseService.getExpense(expenseId);

    res.json({
      success: true,
      data: expense,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * PUT /groups/:groupId/expenses/:expenseId
 * Update an expense and its splits
 */
router.put('/groups/:groupId/expenses/:expenseId', async (req, res) => {
  try {
    const { groupId, expenseId } = req.params;
    const { title, amount, paidBy, currency, split, notes, date } = req.body;

    const updatedExpense = await expenseService.updateExpense(expenseId, {
      groupId,
      title,
      amount: amount !== undefined ? parseFloat(amount) : undefined,
      paidBy,
      currency,
      split,
      notes,
      date,
    });

    res.json({
      success: true,
      data: updatedExpense,
      message: 'Expense updated successfully',
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * DELETE /groups/:groupId/expenses/:expenseId
 * Delete an expense and its splits
 */
router.delete('/groups/:groupId/expenses/:expenseId', async (req, res) => {
  try {
    const { expenseId } = req.params;

    const deletedExpense = await expenseService.deleteExpense(expenseId);

    res.json({
      success: true,
      data: deletedExpense,
      message: 'Expense deleted successfully',
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// ===== REPORTING ROUTES =====

/**
 * GET /groups/:groupId/history
 * Get complete history of expenses and transfers (chronologically ordered)
 */
router.get('/groups/:groupId/history', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { fromDate, toDate, currency, userId } = req.query;

    const history = await reportingService.getGroupHistory(groupId, {
      fromDate,
      toDate,
      currency,
      userId,
    });

    res.json({
      success: true,
      data: history,
      count: history.length,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /groups/:groupId/summary
 * Get summary statistics for a group (optionally with individual user stats)
 * 
 * PRIVACY: Individual stats (userId parameter) are only returned if:
 * - userId is provided in query params
 * - In production with auth: only if requesting user matches the userId
 */
router.get('/groups/:groupId/summary', async (req, res) => {
  try {
    const { groupId } = req.params;
    let { userId } = req.query;

    // PRIVACY CHECK: If userId is requested, ensure it matches authenticated user
    // For now, we log a warning. In production, implement proper JWT auth.
    if (userId) {
      // TODO: Verify req.user.id === userId (requires JWT authentication middleware)
      // For now, we allow but log: console.log(`Individual stats requested for user: ${userId}`);
      console.log(`Individual stats requested for user: ${userId}`);
    }

    const summary = await reportingService.getGroupSummary(groupId, userId);

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
