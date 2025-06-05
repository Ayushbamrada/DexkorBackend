const mongoose = require('mongoose');


const quizQuestionSchema = new mongoose.Schema({
  questionText: String,
  options: [String],
  correctAnswerIndex: Number,
}, { _id: true });


const videoSchema = new mongoose.Schema({
  title: String,
  videoUrl: String,
  thumbnailUrl: String,
  assignment: {
    name: String,
    fileUrl: String,
  }
}, { _id: true });


const documentSchema = new mongoose.Schema({
  name: String,
  fileUrl: String,
}, { _id: true });

const submissionSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  videoId: mongoose.Schema.Types.ObjectId,
  fileUrl: String,
  originalName: String,
}, { _id: true });


const moduleSchema = new mongoose.Schema({
  title: String,
  videos: [videoSchema],
  documents: [documentSchema],
  quiz: {
    questions: [quizQuestionSchema],
  },
  assignmentSubmissions: [submissionSchema], // track per module if needed
}, { _id: true });


const courseSchema = new mongoose.Schema({
  title: String,
  description: String,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  modules: [moduleSchema],
}, { timestamps: true });

module.exports = mongoose.model('Course', courseSchema);
