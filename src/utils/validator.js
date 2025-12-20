/**
 * Validate email format
 */
module.exports.validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!email) {
        return { valid: false, message: 'Email is required' };
    }

    if (!emailRegex.test(email)) {
        return { valid: false, message: 'Invalid email format' };
    }

    return { valid: true };
};

/**
 * Validate password strength
 */
module.exports.validatePassword = (password) => {
    if (!password) {
        return { valid: false, message: 'Password is required' };
    }

    if (password.length < 8) {
        return { valid: false, message: 'Password must be at least 8 characters long' };
    }

    // Check for at least one uppercase letter
    if (!/[A-Z]/.test(password)) {
        return { valid: false, message: 'Password must contain at least one uppercase letter' };
    }

    // Check for at least one lowercase letter
    if (!/[a-z]/.test(password)) {
        return { valid: false, message: 'Password must contain at least one lowercase letter' };
    }

    // Check for at least one number
    if (!/\d/.test(password)) {
        return { valid: false, message: 'Password must contain at least one number' };
    }

    // Check for at least one special character
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
        return { valid: false, message: 'Password must contain at least one special character' };
    }

    return { valid: true };
};

/**
 * Validate phone number (Indian format)
 */
module.exports.validatePhone = (phone) => {
    if (!phone) {
        return { valid: false, message: 'Phone number is required' };
    }

    const phoneRegex = /^[6-9]\d{9}$/;

    if (!phoneRegex.test(phone)) {
        return { valid: false, message: 'Invalid phone number. Must be a 10-digit Indian number' };
    }

    return { valid: true };
};

/**
 * Validate required fields
 */
module.exports.validateRequiredFields = (data, requiredFields) => {
    const missingFields = [];

    requiredFields.forEach(field => {
        if (!data[field] || (typeof data[field] === 'string' && data[field].trim() === '')) {
            missingFields.push(field);
        }
    });

    if (missingFields.length > 0) {
        return {
            valid: false,
            message: `Missing required fields: ${missingFields.join(', ')}`
        };
    }

    return { valid: true };
};

/**
 * Sanitize input to prevent injection attacks
 */
module.exports.sanitizeInput = (input) => {
    if (typeof input !== 'string') return input;

    return input
        .trim()
        .replace(/[<>]/g, '') // Remove potential HTML tags
        .slice(0, 500); // Limit length
};