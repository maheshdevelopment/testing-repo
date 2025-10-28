export const setupSocketHandlers = (io) => {
  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join-room", (userId) => {
      socket.join(`user-${userId}`);
      console.log(`User ${userId} joined their room`);
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
    });
  });
};

export const emitNotification = (io, userId, notification) => {
  io.to(`user-${userId}`).emit("notification", notification);
};

export const emitApplicationUpdate = (io, userId, application) => {
  io.to(`user-${userId}`).emit("application-update", application);
};

export const emitJobMatch = (io, userId, match) => {
  io.to(`user-${userId}`).emit("job-match", match);
};
