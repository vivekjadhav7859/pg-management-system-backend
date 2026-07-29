/**
 * GoBanqo — Room Naming Engine
 *
 * Pure utility — no side effects, no I/O.
 * Generates room number strings from a naming pattern.
 *
 * Supports patterns such as:
 *   prefix=""     start=101 end=110  → ["101","102",...,"110"]
 *   prefix="A"    start=101 end=120  → ["A101","A102",...,"A120"]
 *   prefix="G0"   start=1   end=20   → ["G001","G002",...,"G020"]  (zeroPad)
 *   prefix="F1-"  start=1   end=10   → ["F1-001",...,"F1-010"]     (zeroPad)
 */

const MAX_BATCH_SIZE = 200;
const MAX_PREFIX_LENGTH = 20;
const MIN_NUMBER = 1;
const MAX_NUMBER = 9999;

/**
 * Validate a naming pattern before generating names.
 *
 * @param {string}  prefix
 * @param {number}  startNumber
 * @param {number}  endNumber
 * @returns {{ valid: boolean, error?: string }}
 */
exports.validateNamingPattern = (prefix, startNumber, endNumber) => {
    if (typeof prefix !== 'string') {
        return { valid: false, error: 'Prefix must be a string' };
    }

    if (prefix.length > MAX_PREFIX_LENGTH) {
        return { valid: false, error: `Prefix must be ${MAX_PREFIX_LENGTH} characters or fewer` };
    }

    // Allow alphanumeric, spaces, hyphens, underscores, dots
    if (prefix.length > 0 && !/^[a-zA-Z0-9\s\-_.]*$/.test(prefix)) {
        return { valid: false, error: 'Prefix may only contain letters, numbers, spaces, hyphens, underscores, and dots' };
    }

    const start = Number(startNumber);
    const end = Number(endNumber);

    if (!Number.isInteger(start) || start < MIN_NUMBER || start > MAX_NUMBER) {
        return { valid: false, error: `Start number must be an integer between ${MIN_NUMBER} and ${MAX_NUMBER}` };
    }

    if (!Number.isInteger(end) || end < start || end > MAX_NUMBER) {
        return { valid: false, error: `End number must be an integer between ${start} and ${MAX_NUMBER}` };
    }

    const count = end - start + 1;
    if (count > MAX_BATCH_SIZE) {
        return { valid: false, error: `Batch size (${count}) exceeds maximum allowed (${MAX_BATCH_SIZE})` };
    }

    return { valid: true };
};

/**
 * Generate an array of room number strings.
 *
 * @param {string}  prefix        - Text prepended to every number (e.g. "Room ", "A", "Floor-1-")
 * @param {number}  startNumber   - First number in range (inclusive)
 * @param {number}  endNumber     - Last number in range (inclusive)
 * @param {boolean} zeroPad       - If true, pad numbers to width of endNumber's digit count
 * @returns {string[]}
 */
exports.generateRoomNames = (prefix, startNumber, endNumber, zeroPad = false) => {
    const start = Number(startNumber);
    const end = Number(endNumber);

    const padWidth = zeroPad ? String(end).length : 0;
    const names = [];

    for (let i = start; i <= end; i++) {
        const numStr = zeroPad ? String(i).padStart(padWidth, '0') : String(i);
        names.push(`${prefix}${numStr}`);
    }

    return names;
};

/**
 * Compute count from start + end (convenience helper for handlers).
 *
 * @param {number} startNumber
 * @param {number} endNumber
 * @returns {number}
 */
exports.computeCount = (startNumber, endNumber) => {
    return Number(endNumber) - Number(startNumber) + 1;
};
