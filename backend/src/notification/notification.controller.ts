import { Controller, Get, Patch, Post, Param, Sse, UseGuards, Request } from '@nestjs/common';
import { Observable, map, finalize } from 'rxjs';
import { NotificationService } from './notification.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { NotificationPayload } from './notification.service';

// NestJS's Sse decorator expects each emission to be a MessageEvent —
// the shape { data: ... } that the browser's EventSource API understands.
interface MessageEvent {
  data: string | object;
  id?: string;
  type?: string;
}

@Controller()
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  // ─── SSE stream ──────────────────────────────────────────────────────────
  // The client opens this once on login. The server holds the connection open
  // and pushes JSON events down the pipe whenever a notification is published
  // for this user via Redis Pub/Sub.
  //
  // NestJS's @Sse decorator handles:
  //   - Setting Content-Type: text/event-stream
  //   - Setting Cache-Control: no-cache
  //   - Setting Connection: keep-alive
  //   - Flushing each event immediately
  //
  // The Observable returned here is what NestJS pipes into the response.
  // Each emission becomes one SSE `data:` frame.

  @UseGuards(JwtAuthGuard)
  @Sse('api/notifications/stream')
  stream(@Request() req: { user: { id: string } }): Observable<MessageEvent> {
    const userId = req.user.id;
    const obs = this.notifications.subscribe(userId);

    // Map each NotificationPayload into the MessageEvent shape that
    // NestJS's SSE adapter expects. The browser receives:
    //   id: <notification id>
    //   data: { "id": "...", "type": "friend_request", ... }
    return obs.pipe(
      map((notification: NotificationPayload): MessageEvent => ({
        data: notification,
        id: notification.id,
      })),
      // When the HTTP connection closes (tab closed, navigation, network),
      // NestJS unsubscribes from this Observable. The service's subscribe()
      // wraps its Subject in its own finalize() that completes it, which fires
      // the service's cleanup handler → removeClient(). This empty callback is
      // kept only to mark where the stream teardown begins.
      finalize(() => {
        // Cleanup happens in NotificationService.subscribe()'s finalize.
      }),
    );
  }

  // ─── REST endpoints ──────────────────────────────────────────────────────

  // Fetch unread notifications — called on page load to populate the bell
  // icon badge and dropdown list before any SSE events arrive.
  @UseGuards(JwtAuthGuard)
  @Get('api/notifications')
  getUnread(@Request() req: { user: { id: string } }) {
    return this.notifications.getUnread(req.user.id);
  }

  // Mark a single notification as read — called when the user clicks on a
  // notification in the dropdown or interacts with a toast.
  @UseGuards(JwtAuthGuard)
  @Patch('api/notifications/:id/read')
  markRead(
    @Request() req: { user: { id: string } },
    @Param('id') notificationId: string,
  ) {
    return this.notifications.markRead(notificationId, req.user.id);
  }

  // Mark all notifications as read — called when the user clicks
  // "Mark all as read" in the bell dropdown.
  @UseGuards(JwtAuthGuard)
  @Post('api/notifications/read-all')
  markAllRead(@Request() req: { user: { id: string } }) {
    return this.notifications.markAllRead(req.user.id);
  }
}
