const cloudinary = require('cloudinary').v2;
const logger = require('../utils/logger');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * Middleware to enhance multer uploads with Cloudinary CDN
 * Keeps local files and ALSO uploads to Cloudinary for fast CDN delivery
 * Falls back gracefully if Cloudinary is not configured
 */
const cloudinaryEnhance = async (req, res, next) => {
  try {
    // Check if Cloudinary is configured
    const cloudinaryConfigured = process.env.CLOUDINARY_CLOUD_NAME &&
                                 process.env.CLOUDINARY_API_KEY &&
                                 process.env.CLOUDINARY_API_SECRET;

    // If no files or Cloudinary not configured, just continue
    if (!req.files || !req.files.length || !cloudinaryConfigured) {
      return next();
    }

    // Process each file and upload to Cloudinary in parallel
    const uploadPromises = req.files.map(file =>
      uploadFileToCloudinary(file)
        .then(cloudinaryUrl => {
          // Store Cloudinary URL alongside the file
          file.cloudinaryUrl = cloudinaryUrl;
          logger.info(`File synced to Cloudinary: ${file.filename} -> ${cloudinaryUrl}`);
          return file;
        })
        .catch(error => {
          // Log error but don't fail - local file is sufficient
          logger.warn(`Cloudinary sync failed for ${file.filename}: ${error.message}`);
          return file;
        })
    );

    // Wait for all uploads to complete (or fail gracefully)
    await Promise.allSettled(uploadPromises);

    next();
  } catch (error) {
    logger.error('Cloudinary enhance middleware error:', error);
    // Don't fail the upload, just log the error
    next();
  }
};

/**
 * Upload a file buffer to Cloudinary
 */
const uploadFileToCloudinary = (file) => {
  return new Promise((resolve, reject) => {
    if (!file.buffer) {
      return reject(new Error('No file buffer available'));
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'zeron-investments/properties',
        resource_type: 'auto',
        use_filename: true,
        unique_filename: true,
        quality: 'auto',
        eager: [
          { width: 800, height: 600, crop: 'fill', quality: 'auto', format: 'webp' },
          { width: 400, height: 300, crop: 'fill', quality: 'auto', format: 'webp' }
        ],
        eager_async: false
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result.secure_url);
        }
      }
    );

    uploadStream.end(file.buffer);
  });
};

/**
 * Middleware to serve images with caching headers for fast delivery
 */
const imageCacheHeaders = (req, res, next) => {
  // Set aggressive caching for images
  res.set({
    'Cache-Control': 'public, max-age=31536000, immutable', // 1 year
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'X-XSS-Protection': '1; mode=block'
  });

  next();
};

module.exports = {
  cloudinaryEnhance,
  uploadFileToCloudinary,
  imageCacheHeaders
};
