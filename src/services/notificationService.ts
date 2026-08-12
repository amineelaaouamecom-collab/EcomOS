import { supabase } from "../lib/supabase";

export type NotificationType = 'order' | 'shipping' | 'inventory' | 'customer' | 'system';

export interface CreateNotificationParams {
  userId: string;
  workspaceId: string;
  type: NotificationType;
  title: string;
  message: string;
  entityId?: string;
  entityType?: string;
}

/**
 * Create a user notification
 * This calls the Supabase RPC function to ensure proper RLS and security
 */
export async function createNotification(params: CreateNotificationParams): Promise<void> {
  try {
    const { error } = await supabase.rpc('create_user_notification', {
      p_user_id: params.userId,
      p_workspace_id: params.workspaceId,
      p_type: params.type,
      p_title: params.title,
      p_message: params.message,
      p_entity_id: params.entityId || null,
      p_entity_type: params.entityType || null,
    });

    if (error) {
      console.error('Failed to create notification:', error);
      // Silently fail - notifications are nice-to-have, not critical
    }
  } catch (err) {
    console.error('Notification service error:', err);
  }
}

/**
 * Create a notification for all workspace members
 * Useful for system-wide events like "New integration connected"
 */
export async function createWorkspaceNotification(
  workspaceId: string,
  type: NotificationType,
  title: string,
  message: string,
  entityId?: string,
  entityType?: string
): Promise<void> {
  try {
    // Get all workspace members
    const { data: members, error: membersError } = await supabase
      .from('workspace_members')
      .select('auth_user_id')
      .eq('workspace_id', workspaceId)
      .eq('status', 'active');

    if (membersError || !members) {
      console.error('Failed to fetch workspace members:', membersError);
      return;
    }

    // Create notification for each member
    const notifications = members
      .filter(m => m.auth_user_id) // Filter out null user IDs
      .map(member =>
        createNotification({
          userId: member.auth_user_id!,
          workspaceId,
          type,
          title,
          message,
          entityId,
          entityType,
        })
      );

    await Promise.allSettled(notifications);
  } catch (err) {
    console.error('Workspace notification error:', err);
  }
}

/**
 * Helper functions for common notification types
 */

export async function notifyNewOrder(
  userId: string,
  workspaceId: string,
  orderNumber: string,
  customerName?: string
): Promise<void> {
  await createNotification({
    userId,
    workspaceId,
    type: 'order',
    title: 'New order received',
    message: `Order ${orderNumber}${customerName ? ` from ${customerName}` : ''} needs confirmation`,
    entityId: orderNumber,
    entityType: 'order',
  });
}

export async function notifyOrderStatusChanged(
  userId: string,
  workspaceId: string,
  orderNumber: string,
  newStatus: string
): Promise<void> {
  await createNotification({
    userId,
    workspaceId,
    type: 'order',
    title: 'Order status updated',
    message: `Order ${orderNumber} is now ${newStatus}`,
    entityId: orderNumber,
    entityType: 'order',
  });
}

export async function notifyLowStock(
  userId: string,
  workspaceId: string,
  productName: string,
  currentStock: number
): Promise<void> {
  await createNotification({
    userId,
    workspaceId,
    type: 'inventory',
    title: 'Low stock alert',
    message: `${productName} has only ${currentStock} units remaining`,
    entityId: productName,
    entityType: 'product',
  });
}

export async function notifyShippingUpdate(
  userId: string,
  workspaceId: string,
  orderNumber: string,
  status: string
): Promise<void> {
  await createNotification({
    userId,
    workspaceId,
    type: 'shipping',
    title: 'Shipping update',
    message: `Order ${orderNumber}: ${status}`,
    entityId: orderNumber,
    entityType: 'order',
  });
}