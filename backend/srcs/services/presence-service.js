// Map of connected users: userId -> { socketId, connectTime }
const connectedUsers = new Map();

export function addUserOnline(userId) {
	connectedUsers.set(userId, Date.now());
	console.log(`✅ User ${userId} is now online`);
	console.log(`DEBUG: Online users: [${Array.from(connectedUsers.keys()).join(', ')}]`);
}

export function removeUserOnline(userId) {
	connectedUsers.delete(userId);
	console.log(`❌ User ${userId} is now offline`);
	console.log(`DEBUG: Online users: [${Array.from(connectedUsers.keys()).join(', ')}]`);
}

export function isUserOnline(userId) {
	return connectedUsers.has(userId);
}

export function getOnlineUsers() {
	return Array.from(connectedUsers.keys());
}

export function getConnectedUsersMap() {
	return connectedUsers;
}
