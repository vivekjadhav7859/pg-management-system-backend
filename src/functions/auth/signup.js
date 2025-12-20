const { createUser } = require('../../services/cognito.service');
const response = require('../../utils/response');

module.exports.handler = async (event) => {
    try {
        const { email, password } = JSON.parse(event.body);

        if (!email || !password) {
            return response.error('Email and password are required');
        }

        await createUser(email, password);

        return response.success({ message: 'User registered successfully' }, 201);
    } catch (err) {
        console.error(err);
        return response.error(err.message || 'Signup failed');
    }
};
