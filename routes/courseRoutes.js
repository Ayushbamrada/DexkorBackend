const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const Course = require('../models/Course');
const verifyToken = require('../middlewares/authMiddleware');
const upload = require('../middlewares/upload'); 


router.get('/all-courses', async (req, res) => {
  try {
    const courses = await Course.find().sort({ createdAt: -1 });
    res.status(200).json(courses);
  } catch (error) {
    console.error('Error fetching courses:', error);
    res.status(500).json({ message: 'Failed to fetch courses' });
  }
});

// create course
router.post(
  '/create-course',
  verifyToken,
  upload.any(),
  async (req, res) => {
    try {
      // Check if user is a teacher
      if (req.user.role !== 'teacher') {
        return res.status(403).json({ message: 'Only teachers can create courses' });
      }

      console.log('Request body:', req.body);
      console.log('Files:', req.files);

      // Extract and validate top-level course fields
      const { title, description, teacherId, modules: rawModules } = req.body;
      if (!title || !description || !teacherId) {
        return res.status(400).json({ message: 'Title, description, and teacher ID are required' });
      }

      if (!rawModules || !Array.isArray(rawModules) || rawModules.length === 0) {
        return res.status(400).json({ message: 'At least one module is required' });
      }

      // Build a lookup table of files
      const fileMap = {};
      (req.files || []).forEach((file) => {
        fileMap[file.fieldname] = file;
      });

      // Process modules
      const modules = [];

      for (let modIndex = 0; modIndex < rawModules.length; modIndex++) {
        const rawModule = rawModules[modIndex];
        
        if (!rawModule.moduleTitle || !rawModule.moduleDescription) {
          return res.status(400).json({ 
            message: `Module ${modIndex + 1} missing title or description` 
          });
        }

        const module = {
          title: rawModule.moduleTitle,
          videos: [],
          documents: [],
          quiz: { questions: [] },
          assignmentSubmissions: [],
        };

        // Process videos
        if (rawModule.videos && Array.isArray(rawModule.videos)) {
          for (let vidIndex = 0; vidIndex < rawModule.videos.length; vidIndex++) {
            const video = rawModule.videos[vidIndex];
            
            if (!video.title) {
              return res.status(400).json({ 
                message: `Video ${vidIndex + 1} in module ${modIndex + 1} missing title` 
              });
            }

            // Look for the video file in the uploaded files
            const fileField = `modules[${modIndex}][videos][${vidIndex}][file]`;
            const file = fileMap[fileField];

            if (!file) {
              return res.status(400).json({ 
                message: `Video ${vidIndex + 1} in module ${modIndex + 1} missing file` 
              });
            }

            module.videos.push({
              title: video.title,
              videoUrl: `/uploads/${file.filename}`,
              thumbnailUrl: '',
              assignment: null,
            });
          }
        }

        // Process documents
        if (rawModule.documents && Array.isArray(rawModule.documents)) {
          for (let docIndex = 0; docIndex < rawModule.documents.length; docIndex++) {
            const fileField = `modules[${modIndex}][documents][${docIndex}]`;
            const file = fileMap[fileField];
            
            if (file) {
              module.documents.push({
                name: file.originalname,
                fileUrl: `/uploads/${file.filename}`,
              });
            }
          }
        }

        // Process quiz
        if (rawModule.quiz) {
          try {
            let quizData;
            
            // Parse quiz data if it's a string
            if (typeof rawModule.quiz === 'string') {
              quizData = JSON.parse(rawModule.quiz);
            } else {
              quizData = rawModule.quiz;
            }

            if (Array.isArray(quizData)) {
              // Filter out empty/invalid questions
              const validQuestions = quizData.filter(q => 
                q.question && 
                q.question.trim() && 
                Array.isArray(q.options) && 
                q.options.some(opt => opt && opt.trim()) &&
                typeof q.correctAnswer === 'number'
              );

              module.quiz.questions = validQuestions.map((q, i) => {
                // Validate question structure
                if (!q.question || !Array.isArray(q.options) || q.options.length === 0) {
                  throw new Error(`Invalid quiz question ${i + 1} in module ${modIndex + 1}: Missing question or options`);
                }
                if (!Number.isInteger(q.correctAnswer) || q.correctAnswer < 0 || q.correctAnswer >= q.options.length) {
                  throw new Error(`Invalid correctAnswer in question ${i + 1} of module ${modIndex + 1}: Must be a valid index (0-${q.options.length - 1})`);
                }

                return {
                  questionText: q.question,
                  options: q.options,
                  correctAnswerIndex: q.correctAnswer,
                };
              });
            }
          } catch (err) {
            console.warn(`Quiz parsing error in module ${modIndex + 1}:`, err.message);
            // Continue with empty quiz if parsing fails
          }
        }

        // Validate that module has at least one video
        if (module.videos.length === 0) {
          return res.status(400).json({ 
            message: `Module ${modIndex + 1} must have at least one video` 
          });
        }

        modules.push(module);
      }

      // Create and save the course
      const newCourse = new Course({
        title,
        description,
        createdBy: req.user.userId,
        modules,
      });

      await newCourse.save();
      
      console.log('Course created successfully:', newCourse._id);
      res.status(201).json({ 
        success: true, 
        message: 'Course created successfully!',
        course: newCourse 
      });
    } catch (err) {
      console.error('Course creation error:', err);
      
      // Send more specific error messages
      if (err.message.includes('Module') || err.message.includes('Video') || err.message.includes('quiz')) {
        return res.status(400).json({ 
          success: false, 
          message: err.message 
        });
      }
      
      res.status(500).json({ 
        success: false, 
        message: 'Server error while creating course',
        error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
      });
    }
  }
);

// ✅ Update Course
router.put(
  '/course/:courseId',
  verifyToken,
  upload.fields([
    { name: 'updatedVideos', maxCount: 10 },
    { name: 'newVideos', maxCount: 10 },
    { name: 'updatedDocuments', maxCount: 10 },
    { name: 'newDocuments', maxCount: 10 },
    { name: 'updatedAssignments', maxCount: 10 },
    { name: 'newAssignments', maxCount: 10 },
  ]),
  async (req, res) => {
    try {
      const { courseId } = req.params;

      if (req.user.role !== 'teacher') {
        return res.status(403).json({ message: 'Only teachers can update courses' });
      }

      const existingCourse = await Course.findById(courseId);
      if (!existingCourse) {
        return res.status(404).json({ message: 'Course not found' });
      }

      const {
        title,
        description,
        existingVideoIds,
        existingVideoTitles,
        newVideoTitles,
        existingDocumentIds,
      } = req.body;

      const updatedVideoFiles = req.files['updatedVideos'] || [];
      const newVideoFiles = req.files['newVideos'] || [];
      const updatedDocumentFiles = req.files['updatedDocuments'] || [];
      const newDocumentFiles = req.files['newDocuments'] || [];
      const updatedAssignmentFiles = req.files['updatedAssignments'] || [];
      const newAssignmentFiles = req.files['newAssignments'] || [];

      // Required field checks
      if (!title || !title.trim()) return res.status(400).json({ message: 'Course title is required' });
      if (!description || !description.trim()) return res.status(400).json({ message: 'Course description is required' });

      const existingVideoIdsArray = Array.isArray(existingVideoIds) ? existingVideoIds : existingVideoIds ? [existingVideoIds] : [];
      const existingVideoTitlesArray = Array.isArray(existingVideoTitles) ? existingVideoTitles : existingVideoTitles ? [existingVideoTitles] : [];
      const newVideoTitlesArray = Array.isArray(newVideoTitles) ? newVideoTitles : newVideoTitles ? [newVideoTitles] : [];
      const existingDocumentIdsArray = Array.isArray(existingDocumentIds) ? existingDocumentIds : existingDocumentIds ? [existingDocumentIds] : [];

      // Validate videos
      const allowedVideoTypes = ['video/mp4', 'video/mpeg', 'video/quicktime'];
      for (const file of [...updatedVideoFiles, ...newVideoFiles]) {
        if (!allowedVideoTypes.includes(file.mimetype)) return res.status(400).json({ message: `Invalid video: ${file.originalname}` });
        if (file.size > 100 * 1024 * 1024) return res.status(400).json({ message: `Video too large: ${file.originalname}` });
      }

      // Validate documents
      const allowedDocumentTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain',
      ];
      for (const file of [...updatedDocumentFiles, ...newDocumentFiles]) {
        if (!allowedDocumentTypes.includes(file.mimetype)) return res.status(400).json({ message: `Invalid document: ${file.originalname}` });
        if (file.size > 10 * 1024 * 1024) return res.status(400).json({ message: `Document too large: ${file.originalname}` });
      }

      // Process existing videos
      let finalVideos = [];
      let updatedVideoFileIndex = 0;
      let updatedAssignmentFileIndex = 0;

      for (let i = 0; i < existingVideoIdsArray.length; i++) {
        const videoId = existingVideoIdsArray[i];
        const newTitle = existingVideoTitlesArray[i];
        const existingVideo = existingCourse.videos.find((v) => v._id.toString() === videoId);

        if (existingVideo) {
          let videoToKeep = {
            _id: existingVideo._id,
            title: newTitle || existingVideo.title,
            videoUrl: existingVideo.videoUrl,
            thumbnailUrl: existingVideo.thumbnailUrl || '',
            assignment: existingVideo.assignment || null,
          };

          // Update video file if uploaded
          if (updatedVideoFiles[updatedVideoFileIndex]) {
            const oldPath = path.join(__dirname, '..', existingVideo.videoUrl);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
            videoToKeep.videoUrl = `/uploads/${updatedVideoFiles[updatedVideoFileIndex].filename}`;
            updatedVideoFileIndex++;
          }

          // Update assignment file if uploaded
          if (updatedAssignmentFiles[updatedAssignmentFileIndex]) {
            if (existingVideo.assignment?.fileUrl) {
              const oldAssignPath = path.join(__dirname, '..', existingVideo.assignment.fileUrl);
              if (fs.existsSync(oldAssignPath)) fs.unlinkSync(oldAssignPath);
            }
            videoToKeep.assignment = {
              name: updatedAssignmentFiles[updatedAssignmentFileIndex].originalname,
              fileUrl: `/uploads/${updatedAssignmentFiles[updatedAssignmentFileIndex].filename}`,
            };
            updatedAssignmentFileIndex++;
          }

          finalVideos.push(videoToKeep);
        }
      }

      // Add new videos
      const newVideos = newVideoFiles.map((file, index) => ({
        title: newVideoTitlesArray[index] || file.originalname || `Video ${index + 1}`,
        videoUrl: `/uploads/${file.filename}`,
        thumbnailUrl: '',
        assignment: newAssignmentFiles[index]
          ? {
              name: newAssignmentFiles[index].originalname,
              fileUrl: `/uploads/${newAssignmentFiles[index].filename}`,
            }
          : null,
      }));

      finalVideos = [...finalVideos, ...newVideos];

      // Process existing documents
      let finalDocuments = [];
      let updatedDocumentFileIndex = 0;

      for (let i = 0; i < existingDocumentIdsArray.length; i++) {
        const docId = existingDocumentIdsArray[i];
        const existingDoc = existingCourse.documents.find((d) => d._id.toString() === docId);
        if (existingDoc) {
          let docToKeep = {
            _id: existingDoc._id,
            name: existingDoc.name,
            fileUrl: existingDoc.fileUrl,
          };

          if (updatedDocumentFiles[updatedDocumentFileIndex]) {
            const oldPath = path.join(__dirname, '..', existingDoc.fileUrl);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
            docToKeep.fileUrl = `/uploads/${updatedDocumentFiles[updatedDocumentFileIndex].filename}`;
            docToKeep.name = updatedDocumentFiles[updatedDocumentFileIndex].originalname;
            updatedDocumentFileIndex++;
          }

          finalDocuments.push(docToKeep);
        }
      }

      // Add new documents
      const newDocuments = newDocumentFiles.map((file, index) => ({
        name: file.originalname || `Document ${index + 1}`,
        fileUrl: `/uploads/${file.filename}`,
      }));

      finalDocuments = [...finalDocuments, ...newDocuments];

      // Final course update
      const updatedCourse = await Course.findByIdAndUpdate(
        courseId,
        {
          title,
          description,
          videos: finalVideos,
          documents: finalDocuments,
          updatedAt: new Date(),
        },
        { new: true, runValidators: true }
      );

      res.status(200).json({
        success: true,
        message: 'Course updated successfully',
        course: updatedCourse,
      });
    } catch (err) {
      console.error('Update course error:', err);
      res.status(500).json({ success: false, error: 'Server error while updating course' });
    }
  }
);
// Protected Route: Get Teacher's Own Courses
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

//  Public Route: Get Single Course by ID
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


//  Add a Video to an Existing Course
// router.post(
//   '/course/:courseId/add-video',
//   verifyToken,
//   upload.single('video'),
//   async (req, res) => {
//     try {
//       if (req.user.role !== 'teacher') {
//         return res.status(403).json({ message: 'Only teachers can add videos' });
//       }

//       const { courseId } = req.params;
//       const { title, thumbnail } = req.body;
//       const videoFile = req.file;

//       if (!videoFile) {
//         return res.status(400).json({ message: 'No video file uploaded' });
//       }

//       let video = {
//         title: title || videoFile.originalname,
//         videoUrl: `/uploads/${videoFile.filename}`,
//         thumbnailUrl: '',
//       };

//       if (thumbnail) {
//         const buffer = Buffer.from(thumbnail.split(',')[1], 'base64');
//         const thumbnailFilename = `thumbnail_${Date.now()}.png`;
//         const thumbnailPath = path.join(__dirname, '..', 'uploads', thumbnailFilename);
//         fs.writeFileSync(thumbnailPath, buffer);
//         video.thumbnailUrl = `/uploads/${thumbnailFilename}`;
//       }

//       // Verify course exists and is owned by the teacher
//       const course = await Course.findById(courseId);
//       if (!course) {
//         return res.status(404).json({ message: 'Course not found' });
//       }

//       if (course.createdBy.toString() !== req.user.userId) {
//         return res.status(403).json({ message: 'You can only modify your own courses' });
//       }

//       // Use $push to add video
//       const updatedCourse = await Course.findByIdAndUpdate(
//         courseId,
//         { $push: { videos: video } },
//         { new: true }
//       );

//       res.status(200).json({ success: true, updatedCourse });
//     } catch (err) {
//       console.error('Error adding video:', err);
//       res.status(500).json({ message: 'Server error' });
//     }
//   }
// );



//  Delete a Video from a Course
// router.delete(
//   '/course/:courseId/video/:videoId',
//   verifyToken,
//   async (req, res) => {
//     try {
//       const { courseId, videoId } = req.params;

//       if (req.user.role !== 'teacher') {
//         return res.status(403).json({ message: 'Only teachers can delete videos' });
//       }

//       const course = await Course.findById(courseId);
//       if (!course) {
//         return res.status(404).json({ message: 'Course not found' });
//       }

//       if (course.createdBy.toString() !== req.user.userId) {
//         return res.status(403).json({ message: 'You can only modify your own courses' });
//       }

//       course.videos = course.videos.filter(
//         (video) => video._id.toString() !== videoId
//       );

//       const updatedCourse = await course.save();
//       res.status(200).json({ success: true, updatedCourse });
//     } catch (err) {
//       console.error('Error deleting video:', err);
//       res.status(500).json({ message: 'Server error' });
//     }
//   }
// );

module.exports = router;
