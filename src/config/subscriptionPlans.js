const PLAN_DEFINITIONS = Object.freeze({
    basic: {
        key: 'basic',
        name: 'Basic',
        propertyLimit: 1,
        rank: 1,
        annualAmount: Number(process.env.PLAN_BASIC_ANNUAL_AMOUNT || 299900),
        razorpayPlanId: process.env.RAZORPAY_PLAN_BASIC_ANNUAL || ''
    },
    silver: {
        key: 'silver',
        name: 'Silver',
        propertyLimit: 2,
        rank: 2,
        annualAmount: Number(process.env.PLAN_SILVER_ANNUAL_AMOUNT || 499900),
        razorpayPlanId: process.env.RAZORPAY_PLAN_SILVER_ANNUAL || ''
    },
    gold: {
        key: 'gold',
        name: 'Gold',
        propertyLimit: 5,
        rank: 3,
        annualAmount: Number(process.env.PLAN_GOLD_ANNUAL_AMOUNT || 799900),
        razorpayPlanId: process.env.RAZORPAY_PLAN_GOLD_ANNUAL || ''
    },
    platinum: {
        key: 'platinum',
        name: 'Platinum',
        propertyLimit: 10,
        rank: 4,
        annualAmount: Number(process.env.PLAN_PLATINUM_ANNUAL_AMOUNT || 1199900),
        razorpayPlanId: process.env.RAZORPAY_PLAN_PLATINUM_ANNUAL || ''
    }
});

const getPlan = (planKey) => PLAN_DEFINITIONS[String(planKey || '').toLowerCase()] || null;

const getPlanByRazorpayId = (razorpayPlanId) => (
    Object.values(PLAN_DEFINITIONS).find(plan => plan.razorpayPlanId === razorpayPlanId) || null
);

const getPublicPlans = () => Object.values(PLAN_DEFINITIONS).map(plan => ({
    key: plan.key,
    name: plan.name,
    propertyLimit: plan.propertyLimit,
    amount: Number.isFinite(plan.annualAmount) ? plan.annualAmount : 0,
    currency: 'INR',
    interval: 'yearly',
    available: Boolean(plan.razorpayPlanId && plan.annualAmount > 0)
}));

module.exports = {
    PLAN_DEFINITIONS,
    getPlan,
    getPlanByRazorpayId,
    getPublicPlans
};
