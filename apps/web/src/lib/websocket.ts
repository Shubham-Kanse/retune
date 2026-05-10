interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: number;
}

class WebSocketManager {
  private connections = new Map<string, WebSocket>();

  connect(userId: string, ws: WebSocket): void {
    this.connections.set(userId, ws);

    ws.onclose = () => {
      this.connections.delete(userId);
    };
  }

  send(userId: string, message: WebSocketMessage): boolean {
    const ws = this.connections.get(userId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      ws.send(JSON.stringify(message));
      return true;
    } catch {
      this.connections.delete(userId);
      return false;
    }
  }

  broadcast(message: WebSocketMessage): void {
    for (const [userId, ws] of this.connections) {
      if (!this.send(userId, message)) {
        this.connections.delete(userId);
      }
    }
  }

  getConnectionCount(): number {
    return this.connections.size;
  }
}

export const wsManager = new WebSocketManager();
