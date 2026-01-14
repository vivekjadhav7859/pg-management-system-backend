/**
 * Validate email format
 */
exports.validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!email) {
        return {
            valid: false,
            message: 'Email is required'
        };
    }
    
    if (!emailRegex.test(email)) {
        return {
            valid: false,
            message: 'Invalid email format'
        };
    }
    
    return {
        valid: true
    };
};

/**
 * Validate password strength
 */
exports.validatePassword = (password) => {
    if (!password) {
        return {
            valid: false,
            message: 'Password is required'
        };
    }
    
    if (password.length < 8) {
        return {
            valid: false,
            message: 'Password must be at least 8 characters long'
        };
    }
    
    // Check for uppercase
    if (!/[A-Z]/.test(password)) {
        return {
            valid: false,
            message: 'Password must contain at least one uppercase letter'
        };
    }
    
    // Check for lowercase
    if (!/[a-z]/.test(password)) {
        return {
            valid: false,
            message: 'Password must contain at least one lowercase letter'
        };
    }
    
    // Check for number
    if (!/\d/.test(password)) {
        return {
            valid: false,
            message: 'Password must contain at least one number'
        };
    }
    
    // Check for special character
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
        return {
            valid: false,
            message: 'Password must contain at least one special character'
        };
    }
    
    return {
        valid: true
    };
};

/**
 * Validate required fields
 */
exports.validateRequiredFields = (data, requiredFields) => {
    for (const field of requiredFields) {
        if (!data[field] || (typeof data[field] === 'string' && data[field].trim() === '')) {
            return {
                valid: false,
                message: `${field} is required`
            };
        }
    }
    
    return {
        valid: true
    };
};

/**
 * Sanitize input to prevent XSS
 */
exports.sanitizeInput = (input) => {
    if (typeof input !== 'string') {
        return input;
    }
    
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;')
        .trim();
};

/**
 * Validate phone number (optional, basic validation)
 */
exports.validatePhoneNumber = (phone) => {
    if (!phone) {
        return {
            valid: true // Phone is optional
        };
    }
    
    // Basic phone number validation (10-15 digits)
    const phoneRegex = /^\+?[\d\s\-()]{10,15}$/;
    
    if (!phoneRegex.test(phone)) {
        return {
            valid: false,
            message: 'Invalid phone number format'
        };
    }
    
    return {
        valid: true
    };
};

/**
 * Validate user type for PUBLIC signup (tenant and owner only)
 * Admin users must be created through protected endpoint
 */
exports.validateUserType = (userType, allowedTypes = ['tenant', 'owner']) => {
    if (!userType) {
        return {
            valid: true,
            defaultValue: 'tenant'
        };
    }
    
    if (!allowedTypes.includes(userType)) {
        return {
            valid: false,
            message: `Invalid user type. Allowed types: ${allowedTypes.join(', ')}`
        };
    }
    
    return {
        valid: true,
        value: userType
    };
};

/**
 * Validate user type for ADMIN operations (all roles including admin)
 */
exports.validateUserTypeAdmin = (userType) => {
    const allowedTypes = ['tenant', 'owner', 'admin'];
    
    if (!userType) {
        return {
            valid: false,
            message: 'User type is required'
        };
    }
    
    if (!allowedTypes.includes(userType)) {
        return {
            valid: false,
            message: `Invalid user type. Allowed types: ${allowedTypes.join(', ')}`
        };
    }
    
    return {
        valid: true,
        value: userType
    };
};