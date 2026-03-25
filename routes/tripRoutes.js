const express = require('express');
const tripService = require('../services/tripService');

const router = express.Router();

router.get('/trips', async (req, res) => {
  try {
    const { userId, page, limit } = req.query;

    const trips = await tripService.getUserTrips(
      userId,
      { page, limit },
      req.headers.authorization || null
    );

    res.json(trips);
  } catch (error) {
    const status = error.message === 'User not found' ? 404 : 400;
    res.status(status).json({
      success: false,
      error: error.message,
    });
  }
});

router.post('/trips', async (req, res) => {
  try {
    const { name, destination, startDate, endDate, tripType, createdBy, coverImage } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress || '';

    const trip = await tripService.createTrip(
      {
        name,
        destination,
        startDate,
        endDate,
        tripType,
        createdBy,
        coverImage,
      },
      clientIp,
      req.headers.authorization || null
    );

    res.status(201).json({
      success: true,
      trip,
      message: 'Trip created successfully',
    });
  } catch (error) {
    const status = error.message === 'User not found' ? 404 : 400;
    res.status(status).json({
      success: false,
      error: error.message,
    });
  }
});

router.get('/trips/:tripId', async (req, res) => {
  try {
    const { tripId } = req.params;
    const { userId } = req.query;

    const trip = await tripService.getTripById(
      tripId,
      userId || null,
      req.headers.authorization || null
    );

    res.json({
      success: true,
      trip,
    });
  } catch (error) {
    const status = error.message === 'Trip not found' || error.message === 'User not found' ? 404 : 400;
    res.status(status).json({
      success: false,
      error: error.message,
    });
  }
});

router.put('/trips/:tripId', async (req, res) => {
  try {
    const { tripId } = req.params;
    const trip = await tripService.updateTrip(tripId, req.body || {});

    res.json({
      success: true,
      trip,
      message: 'Trip updated successfully',
    });
  } catch (error) {
    const status = error.message === 'Trip not found' ? 404 : 400;
    res.status(status).json({
      success: false,
      error: error.message,
    });
  }
});

router.get('/trips/:tripId/members', async (req, res) => {
  try {
    const { tripId } = req.params;
    const members = await tripService.getTripMembers(tripId);

    res.json({
      success: true,
      members,
    });
  } catch (error) {
    const status = error.message === 'Trip not found' ? 404 : 400;
    res.status(status).json({
      success: false,
      error: error.message,
    });
  }
});

router.post('/trips/:tripId/members', async (req, res) => {
  try {
    const { tripId } = req.params;
    const { members } = req.body;
    const createdMembers = await tripService.addTripMembers(tripId, members);

    res.status(201).json({
      success: true,
      members: createdMembers,
      message: 'Trip members added successfully',
    });
  } catch (error) {
    const status = error.message === 'Trip not found' ? 404 : 400;
    res.status(status).json({
      success: false,
      error: error.message,
    });
  }
});

router.delete('/trips/:tripId/members/:memberId', async (req, res) => {
  try {
    const { tripId, memberId } = req.params;
    const removedMember = await tripService.removeTripMember(tripId, memberId);

    res.json({
      success: true,
      member: removedMember,
      message: 'Trip member removed successfully',
    });
  } catch (error) {
    const knownErrors = new Set([
      'Trip not found',
      'Member not found',
      'Trip creator cannot be removed',
      'Member cannot be removed after being used in trip expenses',
    ]);
    const status = error.message === 'Trip not found' || error.message === 'Member not found' ? 404 : 400;

    res.status(knownErrors.has(error.message) ? status : 400).json({
      success: false,
      error: error.message,
    });
  }
});

router.post('/trips/:tripId/leave', async (req, res) => {
  try {
    const { tripId } = req.params;
    const { userId } = req.body || {};

    const result = await tripService.leaveTrip(
      tripId,
      userId,
      req.headers.authorization || null
    );

    res.json({
      success: true,
      data: result,
      message: result.deletedTrip
        ? 'Trip deleted because the creator left'
        : 'Left trip successfully',
    });
  } catch (error) {
    const status =
      error.message === 'Trip not found' || error.message === 'You are not a member of this trip'
        ? 404
        : 400;

    res.status(status).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
