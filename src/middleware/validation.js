import { body, param, validationResult } from 'express-validator';

export const validateVideoId = [
  param('videoId')
    .isLength({ min: 11, max: 11 })
    .matches(/^[a-zA-Z0-9_-]{11}$/)
    .withMessage('Video ID must be exactly 11 characters containing only letters, numbers, hyphens, and underscores')
];

export const validateChannelId = [
  param('channelId')
    .isLength({ min: 24, max: 24 })
    .matches(/^UC[a-zA-Z0-9_-]{22}$/)
    .withMessage('Channel ID must be exactly 24 characters starting with "UC"')
];

export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: {
        message: 'Validation failed',
        status: 400,
        timestamp: new Date().toISOString(),
        details: errors.array().map(err => ({
          field: err.path,
          message: err.msg,
          value: err.value
        }))
      }
    });
  }
  
  next();
};