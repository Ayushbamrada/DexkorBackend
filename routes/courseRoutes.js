const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const Course = require('../models/Course');
const verifyToken = require('../middlewares/authMiddleware');
const upload = require('../middlewares/upload'); // Centralized multer setup

// ✅ Public Route: Get All Courses
router.get('/all-courses', async (req, res) => {
  try {
    const courses = await Course.find().sort({ createdAt: -1 });
    res.status(200).json(courses);
  } catch (error) {
    console.error('Error fetching courses:', error);
    res.status(500).json({ message: 'Failed to fetch courses' });
  }
});

// ✅ Protected Route: Create Course (Teachers Only)
router.post(
  '/create-course',
  verifyToken,
  upload.fields([
    { name: 'videos', maxCount: 10 },
    { name: 'documents', maxCount: 10 }
  ]),
  async (req, res) => {
    try {
      if (req.user.role !== 'teacher') {
        return res.status(403).json({ message: 'Only teachers can create courses' });
      }

      const { title, videoTitles, documentTitles } = req.body;
      const videoFiles = req.files['videos'] || [];
      const documentFiles = req.files['documents'] || [];

      const videoTitlesArray = Array.isArray(videoTitles)
        ? videoTitles
        : videoTitles ? [videoTitles] : [];

      const documentTitlesArray = Array.isArray(documentTitles)
        ? documentTitles
        : documentTitles ? [documentTitles] : [];

      const videos = videoFiles.map((file, index) => ({
        title: videoTitlesArray[index] || file.originalname || `Video ${index + 1}`,
        videoUrl: `/uploads/${file.filename}`,
        thumbnailUrl: '',
      }));

      const documents = documentFiles.map((file, index) => ({
        name: documentTitlesArray[index] || file.originalname || `Document ${index + 1}`,
        fileUrl: `/uploads/${file.filename}`,
      }));

      const newCourse = new Course({
        title,
        videos,
        documents,
        createdBy: req.user.userId,
      });

      await newCourse.save();
      res.status(201).json({ success: true, course: newCourse });
    } catch (err) {
      console.error('Upload error:', err);
      res.status(500).json({ success: false, error: 'Server error' });
    }
  }
);

// ✅ Protected Route: Get Teacher's Own Courses
router.get('/teacher/my-courses', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ message: 'Only teachers can access this' });
    }

    const courses = await Course.find({ createdBy: req.user.userId });
    res.json(courses);
  } catch (error) {
    console.error('Error fetching teacher courses:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ✅ Public Route: Get Single Course by ID
router.get('/course/:courseId', async (req, res) => {
  try {
    const { courseId } = req.params;
    const course = await Course.findById(courseId);

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    res.status(200).json(course);
  } catch (error) {
    console.error('Error fetching course by ID:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


// ✅ Add a Video to an Existing Course
router.post(
  '/course/:courseId/add-video',
  verifyToken,
  upload.single('video'),
  async (req, res) => {
    try {
      if (req.user.role !== 'teacher') {
        return res.status(403).json({ message: 'Only teachers can add videos' });
      }

      const { courseId } = req.params;
      const { title, thumbnail } = req.body;
      const videoFile = req.file;

      if (!videoFile) {
        return res.status(400).json({ message: 'No video file uploaded' });
      }

      let video = {
        title: title || videoFile.originalname,
        videoUrl: `/uploads/${videoFile.filename}`,
        thumbnailUrl: '',
      };

      if (thumbnail) {
        const buffer = Buffer.from(thumbnail.split(',')[1], 'base64');
        const thumbnailFilename = `thumbnail_${Date.now()}.png`;
        const thumbnailPath = path.join(__dirname, '..', 'uploads', thumbnailFilename);
        fs.writeFileSync(thumbnailPath, buffer);
        video.thumbnailUrl = `/uploads/${thumbnailFilename}`;
      }

      // Verify course exists and is owned by the teacher
      const course = await Course.findById(courseId);
      if (!course) {
        return res.status(404).json({ message: 'Course not found' });
      }

      if (course.createdBy.toString() !== req.user.userId) {
        return res.status(403).json({ message: 'You can only modify your own courses' });
      }

      // Use $push to add video
      const updatedCourse = await Course.findByIdAndUpdate(
        courseId,
        { $push: { videos: video } },
        { new: true }
      );

      res.status(200).json({ success: true, updatedCourse });
    } catch (err) {
      console.error('Error adding video:', err);
      res.status(500).json({ message: 'Server error' });
    }
  }
);



// ✅ Delete a Video from a Course
router.delete(
  '/course/:courseId/video/:videoId',
  verifyToken,
  async (req, res) => {
    try {
      const { courseId, videoId } = req.params;

      if (req.user.role !== 'teacher') {
        return res.status(403).json({ message: 'Only teachers can delete videos' });
      }

      const course = await Course.findById(courseId);
      if (!course) {
        return res.status(404).json({ message: 'Course not found' });
      }

      if (course.createdBy.toString() !== req.user.userId) {
        return res.status(403).json({ message: 'You can only modify your own courses' });
      }

      course.videos = course.videos.filter(
        (video) => video._id.toString() !== videoId
      );

      const updatedCourse = await course.save();
      res.status(200).json({ success: true, updatedCourse });
    } catch (err) {
      console.error('Error deleting video:', err);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

module.exports = router;
