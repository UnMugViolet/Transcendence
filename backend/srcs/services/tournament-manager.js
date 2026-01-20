import { partyPlayerQueries, userQueries, localTournamentPlayerQueries } from './database-queries.js';
import { sendSysMessage } from './message-service.js';

/**
 * Tournament management service
 * Supports both online tournaments (with registered users) and offline tournaments (with local aliases)
 */

export function createTournament() {
	return {
		1: 0, 2: 0, 3: 0, 4: 0, 
		5: 0, 6: 0, 7: 0, 8: 0,
		"p1": 0, "p2": 0,
		"isOffline": false  // Flag to track if this is an offline tournament
	};
}

export function findNextMatchPlayers(tournamentData, maxTeams = 8) {
    let round = 0;
    for (let i = 1; i <= maxTeams; i++) {
        const v = tournamentData[i] || 0;
        if (v > round) round = v;
    }
    if (round === 0) return { round: 0, p1: 0, p2: 0 };

    let p1 = 0, p2 = 0;
    for (let i = 1; i <= maxTeams; i++) {
        if ((tournamentData[i] || 0) === round) {
            if (!p1) {
				p1 = i;
			}
            else if (!p2) { 
				p2 = i; break;
			}
        }
    }

    return { round, p1, p2 };
}

export function setupNextMatch(partyId, tournamentData) {
	if (!tournamentData) {
		 return { round: 0 };
	}
	const isOffline = tournamentData["isOffline"];
	
	// Get players based on tournament type
	const players = isOffline 
	? localTournamentPlayerQueries.findByPartyId(partyId)
	: partyPlayerQueries.findByPartyId(partyId);
	if (!players) {
		 return { round: 0 };
	}
	
	console.log("tournament data: ", tournamentData);
	const { round, p1, p2 } = findNextMatchPlayers(tournamentData);
	tournamentData["p1"] = p1;
	tournamentData["p2"] = p2;
	console.log(`p1: ${p1}, p2: ${p2}`);

	if (round === 0) {
		return { round: 0 };
	}

	// Get player info based on tournament type
	const p1Info = isOffline 
		? localTournamentPlayerQueries.findByPartyIdAndTeam(partyId, p1)
		: partyPlayerQueries.findByPartyIdAndTeam(partyId, p1);
	const p2Info = isOffline 
		? localTournamentPlayerQueries.findByPartyIdAndTeam(partyId, p2)
		: partyPlayerQueries.findByPartyIdAndTeam(partyId, p2);
	
	// Get names based on tournament type
	const p1Name = isOffline ? (p1Info.alias) : userQueries.getNameById(p1Info.user_id);
	const p2Name = isOffline ? (p2Info.alias) : userQueries.getNameById(p2Info.user_id);
	
	console.log(`Next match in tournament for party ${partyId} is between team ${p1} (${p1Name}) and team ${p2} (${p2Name})`);

	// For offline tournaments, players are always "active" locally
	if (isOffline) {
		sendSysMessage(partyId, 'matchBetween', { p1Name, p2Name });
		localTournamentPlayerQueries.updateStatus(partyId, p1, 'active');
		localTournamentPlayerQueries.updateStatus(partyId, p2, 'active');
	} else {
		const playerStates = checkPlayerStates(p1Info, p2Info);
		sendSysMessage(partyId, 'matchBetween', { p1Name, p2Name });
		handlePlayerStates(partyId, playerStates, p1Info, p2Info);
	}
	
	console.log(`Tournament data: ${JSON.stringify(tournamentData)}`);
	tournamentData[p1]--;
	tournamentData[p2]--;
	
	// For offline tournaments, there are no afk/left states
	if (isOffline) {
		return { round, p1, p2, afk: -1, left: -1, p1Name, p2Name };
	}
	
	const playerStates = checkPlayerStates(p1Info, p2Info);
	return { 
		round, 
		p1, 
		p2, 
		afk: playerStates.afkId, 
		left: playerStates.leftId 
	};
}

function checkPlayerStates(p1Info, p2Info) {
	const left = p1Info.status === 'left' || p2Info.status === 'left';
	const afk = p1Info.status === 'disconnected' || p2Info.status === 'disconnected';
	
	return {
		left,
		afk,
		afkId: afk ? (p1Info.status === 'disconnected' ? p1Info.user_id : p2Info.user_id) : -1,
		leftId: left ? (p1Info.status === 'left' ? p1Info.user_id : p2Info.user_id) : -1
	};
}

function handlePlayerStates(partyId, playerStates, p1Info, p2Info) {
	if (playerStates.afk) {
		const activeId = p1Info.user_id === playerStates.afkId ? p2Info.user_id : p1Info.user_id;
		partyPlayerQueries.updateStatus(activeId, partyId, 'active');
	}
	
	if (playerStates.left) {
		const activeId = p1Info.user_id === playerStates.leftId ? p2Info.user_id : p1Info.user_id;
		partyPlayerQueries.updateStatus(activeId, partyId, 'active');
		
		const leftPlayerName = userQueries.getNameById(playerStates.leftId);
		const activePlayerName = userQueries.getNameById(activeId);
		sendSysMessage(partyId, 'playerLeftTournament', { leftPlayerName, activePlayerName });
	} else {
		// Both players active
		partyPlayerQueries.updateStatus(p1Info.user_id, partyId, 'active');
		partyPlayerQueries.updateStatus(p2Info.user_id, partyId, 'active');
	}
}

export function sendNextGameMessage(party, game, tournamentData) {
	const mode = party.type;
	if (mode !== 'Tournament' && mode !== 'OfflineTournament')
		return;
	
	const shouldSend = (game.score1 === 8 || game.score2 === 8 || Date.now() - game.created >= 60000) && !game.send;
	if (!shouldSend) 
		return;
	
	game.send = true;
	const isOffline = tournamentData["isOffline"];
	const players = isOffline 
		? localTournamentPlayerQueries.findByPartyId(party.id)
		: partyPlayerQueries.findByPartyId(party.id);
	const { round, p1, p2 } = findNextMatchPlayers(tournamentData, players.length);
	
	console.log(`Round# : ${round}`);
	console.log(`Data : ${JSON.stringify(tournamentData)}`);
	
	if (round > 0) {
		let p1Name, p2Name;
		
		if (isOffline) {
			p1Name = p1 ? localTournamentPlayerQueries.getAliasByPartyAndTeam(party.id, p1) : '';
			p2Name = p2 ? localTournamentPlayerQueries.getAliasByPartyAndTeam(party.id, p2) : '';
		} else {
			p1Name = p1 ? userQueries.getNameById(partyPlayerQueries.getUserIdByPartyAndTeam(party.id, p1)) : '';
			p2Name = p2 ? userQueries.getNameById(partyPlayerQueries.getUserIdByPartyAndTeam(party.id, p2)) : '';
		}
		
		let msg = round === 1 
			? 'finalMatch'
			: 'nextMatchBetween';
		
		sendSysMessage(party.id, msg, { p1Name, p2Name });
	}
}

export function initializeTournament(partyId, players) {
	const tournamentData = createTournament();
	const nbPlayers = players.length;
	
	players.forEach(player => {
		let team = Math.floor(Math.random() * nbPlayers) + 1;
		while (tournamentData[team] !== 0) {
			team = Math.floor(Math.random() * nbPlayers) + 1;
		}
		
		if (team <= 8 - nbPlayers) {
			tournamentData[team] = 2;
		} else {
			tournamentData[team] = 3;
		}
		
		partyPlayerQueries.updateTeam(team, partyId, player.user_id);
		const name = userQueries.getNameById(player.user_id);
		console.log(`User ${name} assigned to team ${team} in tournament for party ${partyId}`);
	});
	
	return tournamentData;
}

/**
 * Initialize an offline tournament with local player aliases (no user registration required)
 * @param {number} partyId - The party ID
 * @param {string[]} aliases - Array of player alias strings
 * @returns {object} Tournament data structure
 */
export function initializeOfflineTournament(partyId, aliases) {
	const tournamentData = createTournament();
	tournamentData["isOffline"] = true;
	const nbPlayers = aliases.length;
	
	// First, clear any existing local tournament players for this party
	localTournamentPlayerQueries.delete(partyId);
	
	aliases.forEach(alias => {
		let team = Math.floor(Math.random() * nbPlayers) + 1;
		while (tournamentData[team] !== 0) {
			team = Math.floor(Math.random() * nbPlayers) + 1;
		}
		
		if (team <= 8 - nbPlayers) {
			tournamentData[team] = 2;
		} else {
			tournamentData[team] = 3;
		}
		
		// Create local tournament player with the alias
		localTournamentPlayerQueries.create(partyId, alias, team);
		console.log(`Local player "${alias}" assigned to team ${team} in offline tournament for party ${partyId}`);
	});
	
	return tournamentData;
}

/**
 * Get player name for offline tournament by team number
 * @param {number} partyId - The party ID
 * @param {number} team - The team number
 * @param {boolean} isOffline - Whether this is an offline tournament
 * @returns {string} Player name/alias
 */
export function getPlayerNameByTeam(partyId, team, isOffline) {
	if (isOffline) {
		return localTournamentPlayerQueries.getAliasByPartyAndTeam(partyId, team) || 'Unknown';
	}
	const userId = partyPlayerQueries.getUserIdByPartyAndTeam(partyId, team);
	return userId ? userQueries.getNameById(userId) : 'Unknown';
}
