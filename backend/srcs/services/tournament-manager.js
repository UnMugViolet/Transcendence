import { partyPlayerQueries, userQueries } from './database-queries.js';
import { sendSysMessage } from './message-service.js';

/**
 * Tournament management service
 */

export function createTournament() {
	return {
		1: 0, 2: 0, 3: 0, 4: 0, 
		5: 0, 6: 0, 7: 0, 8: 0
	};
}

export function findNextMatchPlayers(tournamentData, maxTeams = 8) {
	let round = 0;
	let p1 = 0;
	let p2 = 0;
	
	for (let i = 1; i <= maxTeams; i++) {
		if (tournamentData[i] > round) {
			round = tournamentData[i];
			p1 = i;
		}
		if (p1 && tournamentData[i] === round && i !== p1 && tournamentData[p1] !== tournamentData[p2]) {
			p2 = i;
		}
	}
	
	return { round, p1, p2 };
}

export function setupNextMatch(partyId, tournamentData) {
	const players = partyPlayerQueries.findByPartyId(partyId);
	if (!players || !tournamentData) return { round: 0 };

	const { round, p1, p2 } = findNextMatchPlayers(tournamentData);
	
	if (round === 0) return { round: 0 };

	const p1Info = partyPlayerQueries.findByPartyIdAndTeam(partyId, p1);
	const p2Info = partyPlayerQueries.findByPartyIdAndTeam(partyId, p2);
	const p1Name = userQueries.getNameById(p1Info.user_id);
	const p2Name = userQueries.getNameById(p2Info.user_id);
	
	console.log(`Next match in tournament for party ${partyId} is between team ${p1} (${p1Name}) and team ${p2} (${p2Name})`);

	const playerStates = checkPlayerStates(p1Info, p2Info);
	
	sendSysMessage(partyId, `Match entre ${p1Name} et ${p2Name} ! Bonne chance !`);
	
	handlePlayerStates(partyId, playerStates, p1Info, p2Info);
	
	console.log(`Tournament data: ${JSON.stringify(tournamentData)}`);
	tournamentData[p1]--;
	tournamentData[p2]--;
	
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
		sendSysMessage(partyId, `${leftPlayerName} a quitté la partie et est éliminé du tournoi. Victoire pour ${activePlayerName} !`);
	} else {
		// Both players active
		partyPlayerQueries.updateStatus(p1Info.user_id, partyId, 'active');
		partyPlayerQueries.updateStatus(p2Info.user_id, partyId, 'active');
	}
}

export function sendNextGameMessage(party, game, tournamentData) {
	const mode = party.type;
	if (mode !== 'Tournament') return;
	
	const shouldSend = (game.score1 === 8 || game.score2 === 8 || Date.now() - game.created >= 60000) && !game.send;
	if (!shouldSend) return;
	
	game.send = true;
	const players = partyPlayerQueries.findByPartyId(party.id);
	const { round, p1, p2 } = findNextMatchPlayers(tournamentData, players.length);
	
	console.log(`Round# : ${round}`);
	console.log(`Data : ${JSON.stringify(tournamentData)}`);
	
	if (round > 0) {
		const p1Name = p1 ? userQueries.getNameById(partyPlayerQueries.getUserIdByPartyAndTeam(party.id, p1)) : '';
		const p2Name = p2 ? userQueries.getNameById(partyPlayerQueries.getUserIdByPartyAndTeam(party.id, p2)) : '';
		
		let msg = `Le prochain match sera entre ${p1Name} et ${p2Name} ! Tenez-vous prêts !`;
		if (round === 1) {
			msg = `Le gagnant de ce match jouera contre ${p1Name} en finale ! Soyez prêts pour le grand match !`;
		}
		
		sendSysMessage(party.id, msg);
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
