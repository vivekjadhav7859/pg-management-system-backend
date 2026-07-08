const notificationService = require('../../services/notification.service');
const response = require('../../utils/response');

exports.handler = async (event) => {
  try {
        response.setCorsOrigin(event);
    const user = event.requestContext?.authorizer;
    if (!user) return response.error('Unauthorized', 401);

    const { id } = event.pathParameters;
    if (!id) return response.error('Notification ID is required', 400);

    const result = await notificationService.deleteNotification(id);
    return response.success(result);
  } catch (err) {
    console.error(err);
    return response.error('Failed to delete notification', 500);
  }
};
