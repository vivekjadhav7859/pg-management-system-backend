const searchService = require('../../services/search.service');
const response = require('../../utils/response');

exports.handler = async (event) => {
  try {
    const user = event.requestContext?.authorizer;
    if (!user) return response.error('Unauthorized', 401);

    const query = event.queryStringParameters?.q || '';
    if (!query) {
      return response.success({
        properties: [],
        rooms: [],
        tenants: [],
        expenses: [],
        invoices: []
      });
    }

    const results = await searchService.globalSearch(user.userId, query);
    return response.success(results);
  } catch (err) {
    console.error(err);
    return response.error('Failed to perform search', 500);
  }
};
