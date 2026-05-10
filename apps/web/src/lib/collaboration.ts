interface CollaborationEvent {
  type: "cursor" | "edit" | "comment" | "presence";
  userId: string;
  data: any;
  timestamp: number;
}

class CollaborationEngine {
  private rooms = new Map<string, Set<string>>();
  private cursors = new Map<string, { x: number; y: number; user: string }>();
  private activeEdits = new Map<string, { user: string; section: string; timestamp: number }>();

  joinRoom(roomId: string, userId: string): void {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Set());
    }
    this.rooms.get(roomId)!.add(userId);
  }

  leaveRoom(roomId: string, userId: string): void {
    this.rooms.get(roomId)?.delete(userId);
    if (this.rooms.get(roomId)?.size === 0) {
      this.rooms.delete(roomId);
    }
  }

  broadcastToRoom(roomId: string, event: CollaborationEvent, excludeUser?: string): void {
    const users = this.rooms.get(roomId);
    if (!users) return;

    for (const userId of users) {
      if (userId !== excludeUser) {
        // In a real implementation, this would send via WebSocket
        console.log(`Broadcasting to ${userId}:`, event);
      }
    }
  }

  updateCursor(roomId: string, userId: string, x: number, y: number): void {
    this.cursors.set(`${roomId}:${userId}`, { x, y, user: userId });
    this.broadcastToRoom(
      roomId,
      {
        type: "cursor",
        userId,
        data: { x, y },
        timestamp: Date.now(),
      },
      userId,
    );
  }

  startEdit(roomId: string, userId: string, section: string): boolean {
    const editKey = `${roomId}:${section}`;
    const existingEdit = this.activeEdits.get(editKey);

    if (existingEdit && existingEdit.user !== userId) {
      return false; // Section is being edited by someone else
    }

    this.activeEdits.set(editKey, { user: userId, section, timestamp: Date.now() });
    this.broadcastToRoom(
      roomId,
      {
        type: "edit",
        userId,
        data: { section, action: "start" },
        timestamp: Date.now(),
      },
      userId,
    );

    return true;
  }

  endEdit(roomId: string, userId: string, section: string): void {
    const editKey = `${roomId}:${section}`;
    this.activeEdits.delete(editKey);
    this.broadcastToRoom(
      roomId,
      {
        type: "edit",
        userId,
        data: { section, action: "end" },
        timestamp: Date.now(),
      },
      userId,
    );
  }

  getRoomUsers(roomId: string): string[] {
    return Array.from(this.rooms.get(roomId) || []);
  }

  getActiveEdits(roomId: string): Array<{ user: string; section: string }> {
    const edits: Array<{ user: string; section: string }> = [];
    for (const [key, edit] of this.activeEdits) {
      if (key.startsWith(`${roomId}:`)) {
        edits.push({ user: edit.user, section: edit.section });
      }
    }
    return edits;
  }
}

export const collaboration = new CollaborationEngine();
