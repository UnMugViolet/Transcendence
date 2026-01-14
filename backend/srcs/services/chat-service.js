import { 
	inviteQueries, 
	messageQueries, 
	blockQueries, 
	friendQueries, 
	partyQueries, 
	partyPlayerQueries, 
	userQueries 
} from './database-queries.js';
import { isBlocked } from '../utils.js';

/**
 * Chat service for handling invites, messages, and blocking functionality
 */

// Invite service functions
export function validateInviteRequest(inviterId, inviteeId) {
	if (inviterId === inviteeId) {
		return { error: 'You cannot invite yourself', status: 400 };
	}

	const inviter = userQueries.findById(inviterId);
	const invitee = userQueries.findById(inviteeId);

	if (!inviter || !invitee) {
		return { error: 'User not found', status: 404 };
	}

	if (isBlocked(inviterId, inviteeId)) {
		return { error: 'You cannot invite this user', status: 403 };
	}
	return { inviter, invitee };
}

export function validateInviterParty(inviterId) {
	const inviterParty = partyPlayerQueries.findByUserId(inviterId);
	if (!inviterParty) {
		return { error: 'You are not in a party', status: 403 };
	}

	const party = partyQueries.findById(inviterParty.party_id);
	if (!party) {
		return { error: 'Party not found', status: 404 };
	}

	const isInviterInParty = partyPlayerQueries.findByPartyIdAndUserId(party.id, inviterId);
	if (!isInviterInParty) {
		return { error: 'You are not in this party', status: 403 };
	}

	return { party };
}

export function checkInviteConflicts(inviteeId, inviterId, partyId) {
	const isInviteeInParty = partyPlayerQueries.findByPartyIdAndUserId(partyId, inviteeId);
	if (isInviteeInParty && isInviteeInParty.status == 'invited') {
		return { error: 'You have already invited this user to this party', status: 409 };
	}
	if (isInviteeInParty && isInviteeInParty.status != 'left' && isInviteeInParty.status != 'disconnected') {
		return { error: 'This user is already in the party', status: 409 };
	}

	const pendingInvite = inviteQueries.findExisting(inviteeId, inviterId, partyId, 'pending');
	if (pendingInvite) {
		return { error: 'You have already invited this user to this party', status: 409 };
	}

	const acceptedInvite = inviteQueries.findExisting(inviteeId, inviterId, partyId, 'accepted');
	if (acceptedInvite) {
		return { error: 'This user is already in the party', status: 409 };
	}

	return null; // No conflicts
}

export function createInvite(inviteeId, inviterId, partyId) {
	inviteQueries.create(inviteeId, inviterId, partyId);
	const invitee = userQueries.findById(inviteeId);
	return { success: true, inviteeName: invitee.name };
}

// Invite response functions
export function validateInviteResponse(inviteId, inviteeId, status) {
	if (!['accepted', 'rejected'].includes(status)) {
		return { error: 'Invalid action', status: 400 };
	}

	const invite = inviteQueries.findById(inviteId, inviteeId);
	if (!invite) {
		return { error: 'Invite not found', status: 404 };
	}

	if (invite.status !== 'pending') {
		return { error: 'Invite already processed', status: 400 };
	}

	return { invite };
}

export function validateInviteUsers(inviteeId, inviterId) {
	if (inviteeId === inviterId) {
		return { error: 'You cannot respond to your own invite', status: 400 };
	}

	const invitee = userQueries.findById(inviteeId);
	const inviter = userQueries.findById(inviterId);

	if (!invitee || !inviter) {
		return { error: 'User not found', status: 404 };
	}

	if (isBlocked(inviteeId, inviterId)) {
		return { error: 'You cannot respond to this invite', status: 403 };
	}

	return { invitee, inviter };
}

export function processInviteAcceptance(inviteeId, invite) {
	// Check if user is already in a party
	const existingParty = partyPlayerQueries.findByUserIdMultipleStatuses(inviteeId, ['lobby', 'active', 'waiting']);
	const hasExistingParty = existingParty && (Array.isArray(existingParty) ? existingParty.length > 0 : true);
	if (hasExistingParty) {
		return { error: 'You are already in a party', status: 409 };
	}

	const party = partyQueries.findById(invite.party_id);
	if (!party) {
		return { error: 'Party not found', status: 404 };
	}
	// Add user to party and update invite
	partyPlayerQueries.updateStatus(inviteeId, invite.party_id, 'lobby');
	inviteQueries.updateStatus(invite.id, 'accepted');

	return { message: 'Joined party from invite', partyId: invite.party_id, status: 'waiting', gameMode: party.type};
}

export function processInviteRejection(inviteeId, inviteId) {
	
	const invite = inviteQueries.findById(inviteId, inviteeId);
	console.log(`inviteId: ${inviteId}, inviteeId: ${inviteeId}, partyId: ${invite.party_id}`);
	if (!invite)
		return { error: 'Invite not found', status: 404};
	partyPlayerQueries.deleteUser(invite.party_id, inviteeId);
	inviteQueries.delete(inviteId);
	return { success: true };
}

// Block/unblock functions
export function validateBlockRequest(blockerId, blockedId) {
	if (blockerId === blockedId) {
		return { error: 'You cannot block yourself', status: 400 };
	}

	const blocker = userQueries.findById(blockerId);
	const blocked = userQueries.findById(blockedId);

	if (!blocker || !blocked) {
		return { error: 'User not found', status: 404 };
	}

	return { blocker, blocked };
}

export function blockUser(blockerId, blockedId) {
	try {
		friendQueries.delete(blockerId, blockedId);
		blockQueries.create(blockerId, blockedId);
		return { success: true };
	} catch (err) {
		return { error: 'Failed to block user', status: 500 };
	}
}

export function unblockUser(blockerId, blockedId) {
	blockQueries.delete(blockerId, blockedId);
	return { success: true };
}

// Message functions
export function validateMessageRequest(userId, otherUserId) {
	if (isNaN(otherUserId)) {
		return { error: 'Invalid user ID', status: 400 };
	}

	if (isBlocked(userId, otherUserId)) {
		return { error: 'You cannot view messages with this user', status: 403 };
	}

	return null; // Valid request
}

export function getConversation(userId, otherUserId, limit = 100) {
	return messageQueries.findConversation(userId, otherUserId, limit);
}

// WebSocket message validation
export function validateWebSocketMessage(data, senderId) {
	if (!data.type || !data.to || !data.message) {
		throw new Error('Invalid message format');
	}

	if (data.message.length > 500) {
		throw new Error('Message too long');
	}

	if (data.type === 'private' && data.to === senderId) {
		throw new Error('Cannot send message to yourself');
	}

	if (data.type === 'private' && isBlocked(senderId, data.to)) {
		throw new Error('You cannot send messages to this user');
	}
}

export function savePrivateMessage(senderId, receiverId, message, timestamp) {
	messageQueries.create(senderId, receiverId, message, timestamp);
}

export function getPartyPlayers(partyId) {
	return partyPlayerQueries.findByPartyId(partyId);
}

export function addSenderName(data, senderId) {
	const sender = userQueries.findById(senderId);
	data.fromName = sender ? sender.name : 'Unknown';
	return data;
}
