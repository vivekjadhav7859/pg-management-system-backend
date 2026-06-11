const notificationService = require('../../services/notification.service');
const response = require('../../utils/response');

exports.handler = async (event) => {
  try {
    const user = event.requestContext?.authorizer;
    if (!user) return response.error('Unauthorized', 401);

    const count = await notificationService.markAllRead(user.userId);
    return response.success({ message: `Marked ${count} notifications as read` });
  } catch (err) {
    console.error(err);
    return response.error('Failed to mark all as read', 500);
  }
};
