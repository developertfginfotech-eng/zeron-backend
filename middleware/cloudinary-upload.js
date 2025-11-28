const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Local backup storage
const uploadsDir = 'uploads/';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  logger.info('Created uploads directory (backup)');
}

// Configure multer for memory storage (to upload to Cloudinary)
const storage = multer.memoryStorage();

// File filter function
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'application/pdf'
  ];

  const allowedExtensions = /\.(jpg|jpeg|png|webp|pdf)$/i;

  if (allowedMimeTypes.includes(file.mimetype) && allowedExtensions.test(file.originalname)) {
    return cb(null, true);
  }

  const error = new Error(`Invalid file type. Only JPEG, PNG, WebP, and PDF files are allowed. Received: ${file.mimetype}`);
  error.code = 'INVALID_FILE_TYPE';
  cb(error, false);
};

// Configure multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 10,
    fields: 20,
    parts: 30
  },
  fileFilter: fileFilter
});

// Upload to Cloudinary with fallback to local storage
const uploadToCloudinary = async (file) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'zeron-investments',
        resource_type: 'auto',
        eager: [
          { width: 800, height: 600, crop: 'fill', quality: 'auto' }, // Optimized version
          { width: 400, height: 300, crop: 'fill', quality: 'auto' }  // Thumbnail
        ]
      },
      (error, result) => {
        if (error) {
          logger.warn(`Cloudinary upload failed: ${error.message}, falling back to local storage`);
          reject(error);
        } else {
          resolve(result);
        }
      }
    );

    uploadStream.end(file.buffer);
  });
};

// Save to local disk as backup
const saveToLocalDisk = (file) => {
  return new Promise((resolve, reject) => {
    try {
      const uniqueSuffix = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
      const extension = path.extname(file.originalname).toLowerCase();
      const filename = `${file.fieldname}-${uniqueSuffix}${extension}`;
      const filepath = path.join(uploadsDir, filename);

      fs.writeFileSync(filepath, file.buffer);
      resolve({
        url: `/uploads/${filename}`,
        filename: filename,
        size: file.size
      });
    } catch (error) {
      reject(error);
    }
  });
};

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
      default:
        return res.status(400).json({
          success: false,
          message: `Upload error: ${error.message}`,
          code: 'UPLOAD_ERROR'
        });
    }
  }

  if (error.code === 'INVALID_FILE_TYPE') {
    return res.status(400).json({
      success: false,
      message: error.message,
      code: 'INVALID_FILE_TYPE'
    });
  }

  logger.error('Unexpected upload error:', { error: error.message, stack: error.stack });
  return res.status(500).json({
    success: false,
    message: 'Unexpected upload error occurred.',
    code: 'UPLOAD_ERROR'
  });
};

// Validate uploaded files
const validateFiles = (req, res, next) => {
  console.log("=== VALIDATE FILES MIDDLEWARE ===");
  console.log("req.file:", req.file);
  console.log("req.files:", req.files);

  if (req.file) {
    console.log("✓ Single file detected:", {
      fieldname: req.file.fieldname,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    });
    logger.info(`File uploaded - Name: ${req.file.originalname}, User: ${req.user?.id}`);
  }

  if (req.files && Array.isArray(req.files) && req.files.length > 0) {
    console.log(`✓ Multiple files detected: ${req.files.length}`);
    logger.info(`Files uploaded - Count: ${req.files.length}, User: ${req.user?.id}`);
  }

  next();
};

// Process files with Cloudinary + fallback
const processFiles = async (req, res, next) => {
  try {
    console.log("=== PROCESS FILES MIDDLEWARE ===");
    console.log("req.file (single):", req.file ? 'exists' : 'undefined');
    console.log("req.files (array):", req.files ? `${req.files.length} files` : 'undefined');

    // Check for both single file (upload.single) and multiple files (upload.array)
    const filesToProcess = req.file ? [req.file] : (req.files || []);

    if (!filesToProcess || filesToProcess.length === 0) {
      console.log("⚠ No files to process");
      return next();
    }

    console.log(`Processing ${filesToProcess.length} file(s)`);

    const uploadedFiles = [];
    const cloudinaryConfigured = process.env.CLOUDINARY_CLOUD_NAME &&
                                 process.env.CLOUDINARY_API_KEY &&
                                 process.env.CLOUDINARY_API_SECRET;

    console.log("Cloudinary configured:", cloudinaryConfigured ? "YES" : "NO");

    for (const file of filesToProcess) {
      let result;

      // Try Cloudinary first
      if (cloudinaryConfigured) {
        try {
          result = await uploadToCloudinary(file);
          uploadedFiles.push({
            url: result.secure_url,
            filename: result.public_id,
            size: file.size,
            source: 'cloudinary',
            optimized: result.eager
          });
          logger.info(`File uploaded to Cloudinary: ${result.public_id}`);
        } catch (cloudinaryError) {
          // Fallback to local storage
          logger.warn(`Cloudinary failed, using local storage for ${file.originalname}`);
          result = await saveToLocalDisk(file);
          uploadedFiles.push({
            ...result,
            source: 'local'
          });
        }
      } else {
        // Cloudinary not configured, use local storage
        result = await saveToLocalDisk(file);
        uploadedFiles.push({
          ...result,
          source: 'local'
        });
      }
    }

    console.log(`✓ Processed ${uploadedFiles.length} file(s)`);
    console.log("Uploaded files details:", uploadedFiles);

    req.uploadedFiles = uploadedFiles;
    next();
  } catch (error) {
    console.error('File processing error:', error);
    logger.error('File processing error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error processing files',
      code: 'FILE_PROCESSING_ERROR'
    });
  }
};

// Export configurations
module.exports = {
  // Single file upload with Cloudinary
  single: (fieldName) => [
    upload.single(fieldName),
    handleMulterError,
    validateFiles,
    processFiles
  ],

  // Multiple files upload with Cloudinary
  array: (fieldName, maxCount = 10) => [
    upload.array(fieldName, maxCount),
    handleMulterError,
    validateFiles,
    processFiles
  ],

  // Multiple fields with Cloudinary
  fields: (fields) => [
    upload.fields(fields),
    handleMulterError,
    validateFiles,
    processFiles
  ],

  // No files, just form data
  none: () => [
    upload.none(),
    handleMulterError
  ],

  // Raw upload configuration
  raw: upload,

  // Utility functions
  handleMulterError,
  validateFiles,
  uploadToCloudinary,
  saveToLocalDisk
};
