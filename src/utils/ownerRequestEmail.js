const notificationService = require('../services/notification.service');

exports.sendOwnerRequestEmail = async ({
    owner,
    tenant,
    property,
    requestTitle,
    requestType,
    roomNumber,
    visitDate,
    message,
}) => {
    if (!owner?.email) {
        return { sent: false, reason: 'Missing owner email' };
    }

    try {
        const result = await notificationService.sendNotification({
            type: 'TENANT_REQUEST_ALERT',
            ownerId: owner.userId,
            tenantId: tenant?.userId || tenant?.tenantId || '',
            tenantEmail: owner.email, // Sent to owner
            recipientEmail: owner.email,
            replyTo: tenant?.email || undefined,
            propertyId: property?.propertyId || '',
            data: {
                ownerName: owner.name,
                tenantName: tenant?.name || tenant?.email || 'Tenant',
                tenantEmail: tenant?.email || '',
                tenantPhone: tenant?.phone || tenant?.phoneNumber || '',
                propertyName: property?.propertyName || 'Nexus PG',
                roomNumber,
                requestTitle,
                requestType,
                visitDate,
                message
            }
        });

        return { sent: result.sent, provider: 'ses', reason: result.reason };
    } catch (err) {
        console.error('[ownerRequestEmail] Error dispatching request email:', err);
        return { sent: false, reason: err.message };
    }
};
