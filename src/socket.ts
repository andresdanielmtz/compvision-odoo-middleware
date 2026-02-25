import type { Server as SocketServer } from "socket.io";

export function registerSocketHandlers(io: SocketServer): void {
  io.on("connection", (socket) => {
    console.log(`[socket] Client connected: ${socket.id}`);

    socket.on("disconnect", () => {
      console.log(`[socket] Client disconnected: ${socket.id}`);
    });
  });
}
