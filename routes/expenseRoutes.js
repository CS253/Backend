const express = require('express');
const router = express.Router();
const expenseService = require('../services/expenseService');
const reportingService = require('../services/reportingService');
const authMiddleware = require('../middleware/authMiddleware');
const prisma = require('../utils/prismaClient');

const ensureGroupMember = async (req, res, next) => {
  try {
    const membership = await prisma.groupMember.findFirst({
      where: {
        userId: req.userId,
        groupId: req.params.groupId,
      },
    });

    if (!membership) {
      return res.status(403).json({
        success: false,
        error: 'You are not a member of this group',
      });
    }

    return next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Server error',
    });
  }
};

router.use(authMiddleware);
router.use('/groups/:groupId', ensureGroupMember);

// ===== EXPENSE ROUTES =====

/**
 * POST /groups/:groupId/expenses
 * Create a new expense with split configuration
 */
router.post('/groups/:groupId/expenses', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { title, amount, paidBy, currency, split, notes, date } = req.body;

    // Support recorded expenses for others (any group member can record for another)
    const payerId = paidBy || req.userId;

    const expense = await expenseService.createExpense({
      groupId,
      title,
      amount: parseFloat(amount),
      paidBy: payerId,
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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const { fromDate, toDate, currency, paidBy } = req.query;

    const expenses = await expenseService.getGroupExpenses(groupId, {
      fromDate,
      toDate,
      currency,
      userId: paidBy,
      page,
      limit,
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
      userId: req.userId,
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
 * PATCH /groups/:groupId/expenses/:expenseId
 * Partial expense update — only provided fields are changed.
 */
router.patch('/groups/:groupId/expenses/:expenseId', async (req, res) => {
  try {
    const { groupId, expenseId } = req.params;
    const { title, amount, paidBy, currency, split, notes, date } = req.body;

    const updatedExpense = await expenseService.updateExpense(expenseId, {
      userId: req.userId,
      groupId,
      ...(title !== undefined && { title }),
      ...(amount !== undefined && { amount: parseFloat(amount) }),
      ...(paidBy !== undefined && { paidBy }),
      ...(currency !== undefined && { currency }),
      ...(split !== undefined && { split }),
      ...(notes !== undefined && { notes }),
      ...(date !== undefined && { date }),
    });

    res.json({
      success: true,
      data: updatedExpense,
      message: 'Expense updated successfully',
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /groups/:groupId/expenses/:expenseId
 * Delete an expense and its splits
 */
router.delete('/groups/:groupId/expenses/:expenseId', async (req, res) => {
  try {
    const { expenseId } = req.params;

    const deletedExpense = await expenseService.deleteExpense(expenseId, req.userId);

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

    if (userId && userId !== req.userId) {
      return res.status(403).json({
        success: false,
        error: 'You can only request your own individual stats',
      });
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
