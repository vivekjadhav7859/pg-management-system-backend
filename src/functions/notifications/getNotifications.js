const notificationService = require('../../services/notification.service');
const response = require('../../utils/response');

exports.handler = async (event) => {
  try {
    const user = event.requestContext?.authorizer;
    if (!user) return response.error('Unauthorized', 401);

    const notifications = await notificationService.getNotifications(user.userId);
    return response.success({ notifications });
  } catch (err) {
    console.error(err);
    return response.error('Failed to fetch notifications', 500);
  }
};
