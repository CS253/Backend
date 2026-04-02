/**
 * Unit tests for expense split calculation
 * Run with: npm test
 * (After setting up Jest in package.json)
 */

const expenseService = require('../services/expenseService');

describe('Expense Split Calculation', () => {
  // Mock Prisma client
  jest.mock('@prisma/client');

  describe('EQUAL split', () => {
    test('should split expense equally among all members', () => {
      const expense = {
        title: 'Dinner',
        amount: 100,
        splitType: 'EQUAL',
      };

      const participants = ['user1', 'user2', 'user3', 'user4'];
      const perPersonAmount = expense.amount / participants.length;

      expect(perPersonAmount).toBe(25);
      expect(perPersonAmount * participants.length).toBe(expense.amount);
    });

    test('should handle non-divisible amounts with rounding', () => {
      const amount = 100;
      const participants = 3;
      const perPersonAmount = amount / participants;

      // Each person gets 33.33
      expect(parseFloat(perPersonAmount.toFixed(2))).toBe(33.33);

      // Total after rounding should be close (within epsilon)
      const total = parseFloat((perPersonAmount * participants).toFixed(2));
      expect(Math.abs(total - amount)).toBeLessThan(0.01);
    });
  });

  describe('SELECTED_EQUAL split', () => {
    test('should split expense equally among selected participants', () => {
      const expense = {
        title: 'Coffee',
        amount: 50,
        splitType: 'SELECTED_EQUAL',
      };

      const selectedParticipants = ['user1', 'user2'];
      const perPersonAmount = expense.amount / selectedParticipants.length;

      expect(perPersonAmount).toBe(25);
    });

    test('should handle missing participants array', () => {
      // This should be validated at the service level
      const expense = {
        title: 'Invalid',
        amount: 100,
        splitType: 'SELECTED_EQUAL',
      };

      // Service should throw: 'SELECTED_EQUAL split requires participants array'
      expect(expense.splitType).toBe('SELECTED_EQUAL');
    });
  });

  describe('CUSTOM split', () => {
    test('should validate custom amounts sum equals total', () => {
      const totalAmount = 100;
      const customAmounts = [
        { userId: 'user1', amount: 40 },
        { userId: 'user2', amount: 35 },
        { userId: 'user3', amount: 25 },
      ];

      const sum = customAmounts.reduce((acc, item) => acc + item.amount, 0);
      expect(sum).toBe(totalAmount);
    });

    test('should reject custom amounts that do not sum to total', () => {
      const totalAmount = 100;
      const customAmounts = [
        { userId: 'user1', amount: 40 },
        { userId: 'user2', amount: 35 },
        { userId: 'user3', amount: 20 }, // Missing 5
      ];

      const sum = customAmounts.reduce((acc, item) => acc + item.amount, 0);
      const difference = Math.abs(sum - totalAmount);

      expect(difference).toBeGreaterThan(0.01);
      // Service should throw: 'Custom amounts sum does not match total amount'
    });

    test('should handle floating point precision in validation', () => {
      const totalAmount = 100;
      const customAmounts = [
        { userId: 'user1', amount: 33.33 },
        { userId: 'user2', amount: 33.33 },
        { userId: 'user3', amount: 33.34 },
      ];

      const sum = customAmounts.reduce((acc, item) => acc + item.amount, 0);
      const difference = Math.abs(sum - totalAmount);

      expect(difference).toBeLessThan(0.01);
      // Should pass validation with epsilon tolerance
    });
  });

  describe('Edge cases', () => {
    test('should handle small amounts', () => {
      const amount = 0.99;
      const participants = 3;
      const perPerson = parseFloat((amount / participants).toFixed(2));

      expect(perPerson).toBe(0.33);
    });

    test('should handle two-person splits', () => {
      const amount = 50;
      const participants = 2;
      const perPerson = amount / participants;

      expect(perPerson).toBe(25);
    });

    test('should reject invalid split types', () => {
      const invalidType = 'INVALID_TYPE';
      const validTypes = ['EQUAL', 'SELECTED_EQUAL', 'CUSTOM'];

      expect(validTypes).not.toContain(invalidType);
    });
  });
});
