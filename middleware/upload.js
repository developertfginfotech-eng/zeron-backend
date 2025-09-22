const multer = require('multer');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

// Ensure uploads directory exists
const uploadsDir = 'uploads/';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  logger.info('Created uploads directory');
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename: timestamp-randomstring.extension
    const uniqueSuffix = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    const extension = path.extname(file.originalname).toLowerCase();
    const filename = `${file.fieldname}-${uniqueSuffix}${extension}`;
    cb(null, filename);
  }
});

// File filter function
const fileFilter = (req, file, cb) => {
  // Allowed file types
  const allowedMimeTypes = [
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/webp',
    'application/pdf'
  ];

  const allowedExtensions = /\.(jpg|jpeg|png|webp|pdf)$/i;

  // Check MIME type
  if (allowedMimeTypes.includes(file.mimetype)) {
    // Double-check with file extension
    if (allowedExtensions.test(file.originalname)) {
      return cb(null, true);
    }
  }

  // Reject file
  const error = new Error(`Invalid file type. Only JPEG, PNG, WebP, and PDF files are allowed. Received: ${file.mimetype}`);
  error.code = 'INVALID_FILE_TYPE';
  cb(error, false);
};

// Configure multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 10, // Maximum 10 files
    fields: 20, // Maximum 20 non-file fields
    parts: 30 // Maximum 30 parts (files + fields)
  },
  fileFilter: fileFilter
});

// Error handling middleware for multer
const handleMulterError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({
          success: false,
          message: 'File size too large. Maximum size is 10MB per file.',
          code: 'FILE_TOO_LARGE'
        });
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({
          success: false,
          message: 'Too many files. Maximum 10 files allowed.',
          code: 'TOO_MANY_FILES'
        });
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          success: false,
          message: 'Unexpected file field. Check your form configuration.',
          code: 'UNEXPECTED_FILE'
        });
      case 'LIMIT_PART_COUNT':
        return res.status(400).json({
          success: false,
          message: 'Too many form parts.',
          code: 'TOO_MANY_PARTS'
        });
      case 'LIMIT_FIELD_COUNT':
        return res.status(400).json({
          success: false,
          message: 'Too many form fields.',
          code: 'TOO_MANY_FIELDS'
        });
      default:
        return res.status(400).json({
          success: false,
          message: `Upload error: ${error.message}`,
          code: 'UPLOAD_ERROR'
        });
    }
  }

  // Handle custom file filter errors
  if (error.code === 'INVALID_FILE_TYPE') {
    return res.status(400).json({
      success: false,
      message: error.message,
      code: 'INVALID_FILE_TYPE'
    });
  }

  // Log unexpected errors
  logger.error('Unexpected upload error:', {
    error: error.message,
    stack: error.stack,
    userId: req.user?.id
  });

  return res.status(500).json({
    success: false,
    message: 'Unexpected upload error occurred.',
    code: 'UPLOAD_ERROR'
  });
};

// Validate uploaded files middleware
const validateFiles = (req, res, next) => {
  if (req.files && req.files.length > 0) {
    // Log successful uploads
    logger.info(`Files uploaded - Count: ${req.files.length}, User: ${req.user?.id}`, {
      files: req.files.map(file => ({
        originalname: file.originalname,
        filename: file.filename,
        size: file.size,
        mimetype: file.mimetype
      }))
    });

    // Additional validation can be added here
    // For example, checking file content, scanning for malware, etc.
  }

  next();
};

// Clean up orphaned files (utility function)
const cleanupOrphanedFiles = async () => {
  try {
    const files = fs.readdirSync(uploadsDir);
    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000); // 24 hours

    let deletedCount = 0;

    for (const file of files) {
      const filePath = path.join(uploadsDir, file);
      const stats = fs.statSync(filePath);
      
      // Delete files older than 24 hours that aren't referenced in database
      if (stats.mtime.getTime() < oneDayAgo) {
        // Here you would check if the file is referenced in your database
        // For now, we'll skip deletion to be safe
        // fs.unlinkSync(filePath);
        // deletedCount++;
      }
    }

    if (deletedCount > 0) {
      logger.info(`Cleaned up ${deletedCount} orphaned files`);
    }
  } catch (error) {
    logger.error('Error cleaning up orphaned files:', error);
  }
};

// Export different upload configurations
module.exports = {
  // Single file upload
  single: (fieldName) => [
    upload.single(fieldName),
    handleMulterError,
    validateFiles
  ],

  // Multiple files upload
  array: (fieldName, maxCount = 10) => [
    upload.array(fieldName, maxCount),
    handleMulterError,
    validateFiles
  ],

  // Multiple fields upload
  fields: (fields) => [
    upload.fields(fields),
    handleMulterError,
    validateFiles
  ],

  // No files, just form data
  none: () => [
    upload.none(),
    handleMulterError
  ],

  // Raw upload configuration (for custom usage)
  raw: upload,

  // Utility functions
  cleanupOrphanedFiles,
  handleMulterError,
  validateFiles
};

// Schedule cleanup job (if needed)
// setInterval(cleanupOrphanedFiles, 24 * 60 * 60 * 1000); // Run daily