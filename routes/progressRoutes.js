// routes/progress.js
const express = require('express');
const router = express.Router();
const Progress = require('../models/Progress');
const authenticate = require('../middlewares/authMiddleware');

// Update progress (watchedSeconds, videoDuration, completed)
router.post('/update', authenticate, async (req, res) => {
  const { courseId, videoId, watchedSeconds, videoDuration, completed } = req.body;
  const userId = req.user.id;

  if (
    !courseId ||
    !videoId ||
    watchedSeconds == null ||
    videoDuration == null
  ) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    // Find and update or create new progress record
    const updated = await Progress.findOneAndUpdate(
      { userId, courseId, videoId },
      {
        watchedSeconds: Math.min(watchedSeconds, videoDuration), // clamp
        videoDuration,
        completed: completed || false,
      },
      { upsert: true, new: true }
    );

    res.json(updated);
  } catch (err) {
    console.error('Error saving progress:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get all progress for a course
router.get('/:courseId', authenticate, async (req, res) => {
  const userId = req.user.id;
  const courseId = req.params.courseId;

  try {
    const progressData = await Progress.find({ userId, courseId });
    res.json(progressData);
  } catch (err) {
    console.error('Error fetching progress:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
