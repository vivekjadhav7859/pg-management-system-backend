const notificationService = require('../../services/notification.service');
const response = require('../../utils/response');

exports.handler = async (event) => {
  try {
    const user = event.requestContext?.authorizer;
    if (!user) return response.error('Unauthorized', 401);

    const { id } = event.pathParameters;
    if (!id) return response.error('Notification ID is required', 400);

    const notification = await notificationService.markRead(id);
    return response.success({ notification });
  } catch (err) {
    console.error(err);
    return response.error('Failed to mark notification as read', 500);
  }
};
