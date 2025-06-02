const mongoose = require('mongoose');

const ProgressSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  videoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Video', required: true },
  watchedSeconds: { type: Number, required: true },
  videoDuration: { type: Number, required: true },
  completed: { type: Boolean, default: false },
});

module.exports = mongoose.model('Progress', ProgressSchema);
