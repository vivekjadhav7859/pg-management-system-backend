const IST_TIME_ZONE = 'Asia/Kolkata';

function parseISODateOnly(value) {
    if (!value) return null;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return null;
    }

    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
    ) {
        return null;
    }

    return { year, month, day, date };
}

function formatDateIN(value) {
    const parsed = parseISODateOnly(value);
    if (!parsed) return value || '';

    return `${String(parsed.day).padStart(2, '0')}/${String(parsed.month).padStart(2, '0')}/${parsed.year}`;
}

function getTodayISOInIST(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: IST_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(now);

    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

function isPastISODateInIST(value, now = new Date()) {
    const parsed = parseISODateOnly(value);
    if (!parsed) return false;
    return value < getTodayISOInIST(now);
}

module.exports = {
    IST_TIME_ZONE,
    parseISODateOnly,
    formatDateIN,
    getTodayISOInIST,
    isPastISODateInIST,
};
