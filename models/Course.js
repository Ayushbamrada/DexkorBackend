const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema({
  title: String,
  videoUrl: String,
  thumbnailUrl: String,
}, { _id: true }); // ensure each video gets a unique ID

const documentSchema = new mongoose.Schema({
  name: String,
  fileUrl: String,
}, { _id: true }); // ensure each document gets a unique ID

const courseSchema = new mongoose.Schema({
  title: String,
  videos: [videoSchema],
  documents: [documentSchema],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, { timestamps: true });

module.exports = mongoose.model('Course', courseSchema);
