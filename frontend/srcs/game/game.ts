import { BACKEND_URL } from "../utils/config.js";
import { ws as socket } from "../user/chat.js";
import { handleRoute, getToken, ModalManager } from "../index.js";
import { initChatSocket } from "../user/chat.js";
import { i18n } from "../utils/i18n.js";
import { AuthManager } from "../user/auth.js";

const pong = document.getElementById('pongCanvas') as HTMLCanvasElement | null;
const pongMenu = document.getElementById('pongMenu') as HTMLDivElement | null;
const backToMenu = document.getElementById('backToMenu') as HTMLButtonElement | null;

let mode: string = '';

export function initPongBtns() {
	const btnOffline = document.getElementById('btnOffline') as HTMLButtonElement | null;
	const btnOnline = document.getElementById('btnOnline') as HTMLButtonElement | null;
	const btnTournament = document.getElementById('btnTournament') as HTMLButtonElement | null;
	const btnIA = document.getElementById('btnIA') as HTMLButtonElement | null;

	if (btnOffline) {
		btnOffline.onclick = () => {
			mode = '1v1Offline';
			console.log("mod selected from init: ", mode);
			joinGame(mode);
		};
	}
	if (btnOnline) {
		btnOnline.onclick = () => {
			mode = '1v1Online';
			console.log("mod selected from init: ", mode);
			joinGame(mode);
		};
	}
	if (btnTournament) {
		btnTournament.onclick = () => {
			mode = 'Tournament';
			console.log("mod selected from init: ", mode);
			joinGame(mode);
		};
	}
	if (btnIA) {
		btnIA.onclick = () => {
			mode = 'IA';
			console.log("mod selected from init: ", mode);
			joinGame(mode);
		};
	}
}

// Fonction pour arrêter d'appeler 1000 fois /leave
export async function leaveGame(options: { navigate?: boolean; closeSocket?: boolean; resetState?: boolean } = {}) {
	const opts = { navigate: true, closeSocket: true, resetState: true, ...options };
	let token = AuthManager.getToken();
	if (!token) {
		console.warn("No token found, cannot leave game.");
		return;
	} 

	try {
		await fetch(`${BACKEND_URL}/leave`, {
			method: "POST",
			headers: { Authorization: `Bearer ${token}` },
		});
	} catch (err) {
		console.error("Error Leave Game:", err);
	}

	if (opts.closeSocket) socket?.close();

	if (opts.resetState) {
		gameId = 0;
		team = 0;
		started = false;
		// hide local lobby options when leaving
		const lobbyLocalOptions = document.getElementById('lobbyLocalOptions');
		const lobby = document.getElementById('lobby');
		const startBtn = document.getElementById('btnStart');
		const backBtn = document.getElementById('backToMenu');

		if (lobbyLocalOptions && lobby && startBtn && backBtn) {
			lobbyLocalOptions.classList.add('hidden');
			lobby.classList.add('hidden');
			startBtn.classList.add('hidden');
			backBtn.classList.add('hidden');
		}

	}

	if (opts.navigate) {
		navigateTo('pongMenu', true);
		handleRoute();
	}
}

if (!pong) {
	console.error("Pong canvas not found!");
	throw new Error("Pong canvas not found");
}

pong.width = pong.clientWidth;
pong.height = pong.clientHeight;

const width = pong.width;
const height = pong.height;
const ctx = pong.getContext('2d') as CanvasRenderingContext2D;

const paddleWidth = 0.01 * width;
const paddleHeight = 0.16 * height;
const ballRadius = 0.01 * width;

let posXPlayer1 = 0.05 * width;
let posYPlayer1 = height / 2;
let posXPlayer2 = width - 0.05 * width;
let posYPlayer2 = height / 2;

let player1Score = 0;
let player2Score = 0;

let upPlayer1 = false;
let downPlayer1 = false;
let upPlayer2 = false;
let downPlayer2 = false;

let ballX = width / 2;
let ballY = height / 2;

let started = false;
export let gameId = 0;
let team = 0;

let pauseInterval: any;

const modalGamePause = document.getElementById("modalGamePause");
const modalReconnect = document.getElementById("modalReconnect");

const yes = document.getElementById("btnReconnectYes");
const no = document.getElementById("btnReconnectNo");
const start = document.getElementById("btnStart");
const goodBye = document.getElementById("goodBye");

// Pour que le popstate soit trigger seulement quand l'utilisateur clique sur le bouton retour du navigateur
export let isInternalNavigation = false;

export function navigateTo(viewId: string, replace = false) {
	isInternalNavigation = true;
	if (replace) {
		history.replaceState({ page: viewId }, "", '#' + viewId);
	} else {
		window.location.hash = '#' + viewId;
	}
	setTimeout(() => (isInternalNavigation = false), 100);
}

// Ensure lobby UI is hidden when we navigate away from the lobby
export function hideLobbyUI() {
	const lobby: HTMLElement | null = document.getElementById('lobby');
	if (lobby) {
		lobby.classList.add('hidden');
	}
	const lobbyLocalOptions = document.getElementById('lobbyLocalOptions');
	if (lobbyLocalOptions) {
		lobbyLocalOptions.classList.add('hidden');
	}
	const startBtn = document.getElementById('btnStart'); if (startBtn) startBtn.classList.add('hidden');
	const backBtn = document.getElementById('backToMenu'); if (backBtn) backBtn.classList.add('hidden');
	const startMessage = document.getElementById('startMessage'); if (startMessage) { startMessage.textContent = ''; startMessage.classList.add('hidden'); }
}

window.addEventListener('hashchange', () => {
	if (location.hash !== '#lobby') hideLobbyUI();
});

// A revoir ?
window.addEventListener("popstate", async (event) => {
	if (isInternalNavigation) {
		return;
	}

	if (started && (mode === '1v1Offline' || mode === 'IA')) {
		const leave = confirm(i18n.t("confirm"));
		if (leave) {
			await leaveGame({ navigate: false, resetState: false });
			await endingGame({ winner: 0, mode: mode });
			console.log("Leaving game...");
			isInternalNavigation = true;
			history.replaceState(null, "", "pongMenu");
			handleRoute();
			setTimeout(() => (isInternalNavigation = false), 100);
		} else {
			isInternalNavigation = true;
			navigateTo('viewGame', true);
			handleRoute();
			started = true;
			setTimeout(() => (isInternalNavigation = false), 100);
		}
	} else if (started && (mode === '1v1Online' || mode === 'Tournament')) {
		event.preventDefault();
		started = false;
		modalReconnect?.classList.remove("hidden");
		socket?.close();
		isInternalNavigation = true;
		setTimeout(() => (isInternalNavigation = false), 100);
	}
});

backToMenu?.addEventListener("click", async () => {
	console.log("Leaving game...");
	await leaveGame();
});


no?.addEventListener("click", async () => {
	modalReconnect?.classList.add("hidden");

	// Show the "Thanks for playing" message briefly before returning to menu
	goodBye?.classList.remove("hidden");
	await sleep(2000);

	console.log("Leaving game...");
	await leaveGame();
	// leaveGame handles navigation and state reset
});

yes?.addEventListener("click", async () => {
	let token = AuthManager.getToken();
	if (!token) {
		return;
	}

	console.log("Resuming game...");
	try {
		await new Promise<void>((resolve) => {
			initChatSocket(token, resolve);
		});
		await fetch(`${BACKEND_URL}/resume`, {
			method: "POST",
			headers: { Authorization: `Bearer ${token}` },
		});
	} catch (err) {
		console.error("Error Resume Game:", err);
	}

	modalReconnect?.classList.add("hidden");
	started = true;
});

start?.addEventListener("click", async () => {
	let token = AuthManager.getToken();
	if (!token) return;

	try {
		// Ensure WebSocket is connected before starting so we can receive the 'start' event
		await new Promise<void>((resolve) => {
			initChatSocket(token!, resolve);
		});
		console.log("Starting game...");
		const res = await fetch(`${BACKEND_URL}/start`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Bearer ${token}`
			},
			body: JSON.stringify({ mode })
		});
		const data = await res.json();
		console.log("Start Game Response:", data); // DEBUG

		if (!res.ok) {
			// Use backend message if provided
			throw new Error(data && data.error ? data.error : i18n.t("failedStart"));
		}

		if (data.players) {
			const p1 = (data.players as Array<any>).find(p => p.team === 1);
			const p2 = (data.players as Array<any>).find(p => p.team === 2);
			if (p1) sessionStorage.setItem("player1Name", p1.name);
			if (p2) sessionStorage.setItem("player2Name", p2.name);
		}

		if (mode === '1v1Offline') {
			const lobbyInput = document.getElementById('lobbyPlayer2Name') as HTMLInputElement | null;
			if (lobbyInput && lobbyInput.value && lobbyInput.value.trim()) {
				sessionStorage.setItem('player2Name', lobbyInput.value.trim());
			} else {
				sessionStorage.setItem('player2Name', i18n.t("playerTwo") || "Player 2");
			}
			const username = sessionStorage.getItem('username') || sessionStorage.getItem('player1Name') || i18n.t("player1");
			sessionStorage.setItem('player1Name', username);
		} else if (mode === 'IA') {
			// Set up AI opponent name
			const username = sessionStorage.getItem('username') || sessionStorage.getItem('player1Name') || i18n.t("player1");
			sessionStorage.setItem('player1Name', username);
			sessionStorage.setItem('player2Name', i18n.t("ai") || "AI");
		}

		// hide local lobby options when the game actually starts
		const lobbyLocalOptions = document.getElementById('lobbyLocalOptions');

		if (lobbyLocalOptions) {
			lobbyLocalOptions.classList.add('hidden');
		}

		navigateTo('viewGame');

		// Fallback for single-player modes: if 'start' WS message doesn't arrive shortly, start locally
		if ((mode === '1v1Offline' || mode === 'IA')) {
			const partyId = Number((data && data.partyId) || sessionStorage.getItem('partyId'));
			if (!gameId && partyId) gameId = partyId;
			if (!team) team = 1;
			console.log("Setting fallback timeout for mode:", mode, "gameId:", gameId, "team:", team); // DEBUG
			setTimeout(async () => {
				if (!started) {
					console.log("No WS 'start' received yet; triggering local start fallback."); // DEBUG
					started = true;
					// Initialize positions for the fallback case
					console.log("Before fallback init - positions:", {ballX, ballY, posYPlayer1, posYPlayer2}); // DEBUG
					posYPlayer1 = height / 2;
					posYPlayer2 = height / 2;
					ballX = width / 2;
					ballY = height / 2;
					console.log("After fallback init - positions:", {ballX, ballY, posYPlayer1, posYPlayer2}); // DEBUG
					await startingGame(false, true);
				} else {
					console.log("WS 'start' already received, skipping fallback."); // DEBUG
				}
			}, 300);
		}
	} catch (err) {
		console.error("Error Start Game:", err);
		const startMessage = document.getElementById('startMessage') as HTMLElement | null;
		const messageText = err instanceof Error ? err.message : String(err);
		if (startMessage) {
			startMessage.textContent = messageText;
			startMessage.classList.remove('hidden');
			startMessage.classList.add('flex');
		}
	}
});

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

//demarrer la partie pour tous les joueurs 
async function startingGame(resume = false, timer = true) {
	console.log("startingGame called, resume:", resume, "timer:", timer); // DEBUG
	console.log("Game is starting!");
	navigateTo('viewGame');
	ctx.clearRect(0, 0, width, height);
	ctx.font = "50px Arial";
	ctx.fillStyle = "rgb(254, 243, 199)";
	ctx.textAlign = "center";
	if (timer) {
		if (resume) ctx.fillText(i18n.t("gameResumes"), width / 2, height / 2 - 40);
		else ctx.fillText(i18n.t("gameStarts"), width / 2, height / 2 - 40);
		let countdown = 5;
		console.log("Starting countdown from 5"); // DEBUG
		const countdownInterval = setInterval(() => {
			ctx.clearRect(0, height / 2 - 20, width, 100);
			ctx.fillStyle = "rgb(239, 68, 68)";
			ctx.fillText(countdown.toString(), width / 2, height / 2 + 40);
			console.log("Countdown:", countdown); // DEBUG
			countdown--;
			if (countdown < 0) {
				clearInterval(countdownInterval);
				ctx.clearRect(0, height / 2 - 20, width, 100);
				console.log("Countdown finished"); // DEBUG
			}
		}, 1000);
		await sleep(6000);
	}
	
	console.log("About to start remoteGameLoop"); // DEBUG
	remoteGameLoop();
}

async function endingGame(data: any) {
	console.log("Game is ending...");
	started = false;
	gameId = 0;
	team = 0;
	await sleep(100);
	ctx.clearRect(0, 0, width, height);
	ctx.font = "40px Arial";
	ctx.fillStyle = "rgb(254, 243, 199)";
	ctx.textAlign = "center";

	if (data.winner && !data.round && data.mode === 'Tournament')
		ctx.fillText(`${data.winner} ${i18n.t("wonTournament")}`, width / 2, height / 2);
	else if (data.winner)
		ctx.fillText(`${data.winner} ${i18n.t("wonGame")}`, width / 2, height / 2);
	goodBye?.classList.remove("hidden");
	await sleep(3000);
	navigateTo('pongMenu', true);
	handleRoute();
}

function formatTime(sec: number) {
	let min = Math.floor(sec / 60);
	sec = sec % 60;
	if (min < 1)
		return sec < 10 ? `0${sec}` : `${sec}`;
	return min < 10 ? `0${min}:${sec < 10 ? `0${sec}` : sec}` : `${min}:${sec < 10 ? `0${sec}` : sec}`;
}

function startTimer(sec: number) {
	let pauseSeconds = sec;

	const timerElem = document.getElementById('pauseTimer');
	if (timerElem) {
		timerElem.textContent = formatTime(pauseSeconds);
		timerElem.style.color = "";
	}

	clearInterval(pauseInterval);
	pauseInterval = setInterval(() => {
		pauseSeconds--;
		if (timerElem) {
			timerElem.textContent = formatTime(pauseSeconds);
			if (pauseSeconds <= 10) timerElem.style.color = "red";
			else timerElem.style.color = "";
		}
		if (pauseSeconds <= 0) clearInterval(pauseInterval);
	}, 1000);
}

export async function handleGameRemote(data: any) {
	console.log("handleGameRemote called with:", data); // DEBUG
	
	if (data.type === "start" && !started) {
		console.log("Processing start message"); // DEBUG
		modalGamePause?.classList.add("hidden");
		if (pauseInterval) clearInterval(pauseInterval);
		const resume = data.resume || false;
		const timer = data.timer || true;
		gameId = data.game;
		team = data.team;

		console.log("Game ID set to:", gameId, "Team set to:", team); // DEBUG

		if (data.players && Array.isArray(data.players)) {
			const p1 = (data.players as Array<any>).find(p => p.team === 1);
			const p2 = (data.players as Array<any>).find(p => p.team === 2);
			if (p1 && p1.name) sessionStorage.setItem('player1Name', p1.name);
			if (p2 && p2.name) sessionStorage.setItem('player2Name', p2.name);
		}

		started = true;
		console.log("About to call startingGame"); // DEBUG
		await startingGame(resume, timer);
		return true;
	}
	if (data.type === "stop") {
		modalGamePause?.classList.add("hidden");
		if (pauseInterval) clearInterval(pauseInterval);
		await endingGame(data);
		return true;
	}
	if (data.type === "pause") {
		modalGamePause?.classList.remove("hidden");
		startTimer(90);
		started = false;
		return true;
	}
	if (data.type === "reconnect" && !started) {
		modalReconnect?.classList.remove("hidden");
		pongMenu?.classList.add("hidden");
		return true;
	}
	if (data.type === "game" && started) {
		const value = data.data;
		console.log("Received game data from server:", value); // DEBUG
		console.log("Canvas dimensions:", {width, height}); // DEBUG
		
		// Store old positions for comparison
		const oldPositions = {ballX, ballY, posYPlayer1, posYPlayer2};
		
		posYPlayer1 = value.paddle1Y * height;
		posYPlayer2 = value.paddle2Y * height;
		ballX = value.ballX * width;
		ballY = value.ballY * height;
		player1Score = value.score1;
		player2Score = value.score2;
		
		console.log("Position update - old:", oldPositions, "new:", {ballX, ballY, posYPlayer1, posYPlayer2}); // DEBUG
		return true;
	}
	console.log("Message not handled, returning false"); // DEBUG
	return false;
};

async function joinGame(mode: string) {
	let token = AuthManager.getToken();

	if (!token) {
		console.warn("No token found, cannot join game.");
		return;
	}

	// Clear any previous start error message when attempting to join
	const startMessage = document.getElementById('startMessage') as HTMLElement | null;
	if (startMessage) {
		startMessage.textContent = '';
		startMessage.classList.add('hidden');
	}

	try {
		await new Promise<void>((resolve) => {
			initChatSocket(token, resolve);
		});
		const globalChatMessages: HTMLElement | null = document.getElementById("globalChatMessages");

		if (globalChatMessages) {
			globalChatMessages.innerHTML = "";
		}
		console.log("Joining game...");
		console.log("Trying to join mode:", mode);

		let res = await fetch(`${BACKEND_URL}/join`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Bearer ${token}`
			},
			body: JSON.stringify({ mode })
		});

		let data = await res.json();
		console.log("Join Game Response:", data); // DEBUG

		if (!res.ok) {
			// If already in a game, attempt a quick leave and retry once
			if (data && typeof data.error === 'string' && data.error.includes('already in a game')) {
				console.warn('Already in a game, attempting to leave and retry join...');
				try {
					await fetch(`${BACKEND_URL}/leave`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
				} catch (_) {}
				// retry join once
				res = await fetch(`${BACKEND_URL}/join`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
					body: JSON.stringify({ mode })
				});
				data = await res.json();
				console.log('Join Retry Response:', data);
				if (!res.ok) throw new Error(data.error || i18n.t('failedJoin'));
			} else {
				throw new Error(data.error || i18n.t('failedJoin'));
			}
		}

		if (data.partyId) {
			sessionStorage.setItem("partyId", data.partyId.toString());
			console.log("Joined Party ID:", data.partyId);
		}
		if (data.team) {
			sessionStorage.setItem("team", data.team);
		}

		ctx.clearRect(0, 0, width, height);
		ctx.font = "40px Arial";
		ctx.fillStyle = "rgb(254, 243, 199)";
		ctx.textAlign = "center";
		
		// Different messages for different modes
		if (mode === '1v1Offline') {
			ctx.fillText(i18n.t("offlineGameReady") || "Offline Game Ready - Click Start to Play!", width / 2, height / 2);
		} else if (mode === 'IA') {
			ctx.fillText(i18n.t("aiGameReady") || "AI Game Ready - Click Start to Play!", width / 2, height / 2);
		} else {
			ctx.fillText(i18n.t("waitingOpponent"), width / 2, height / 2);
		}

        const lobby = document.getElementById("lobby");
        if (lobby) {
 			lobby.classList.remove("hidden");
		}
        navigateTo('lobby');

		// Show/hide local lobby options depending on mode
		const lobbyLocalOptions = document.getElementById('lobbyLocalOptions');

		if ((mode === '1v1Offline' || mode === 'IA') && lobbyLocalOptions) {
			lobbyLocalOptions.classList.remove('hidden');
			lobbyLocalOptions.classList.add('flex');
			
			// For IA mode, hide the player 2 name input since it's always "AI"
			const player2Input = document.getElementById('lobbyPlayer2Name') as HTMLInputElement | null;
			if (mode === 'IA' && player2Input) {
				player2Input.style.display = 'none';
			} else if (mode === '1v1Offline' && player2Input) {
				player2Input.style.display = 'block';
			}
		}
		else if (lobbyLocalOptions) {
			lobbyLocalOptions.classList.add('hidden');
		}

		start?.classList.remove("hidden");
		backToMenu?.classList.remove("hidden");
		goodBye?.classList.add("hidden");
	} catch (err) {
		console.error("Error Join Game:", err);
	}
}function isTyping() {
	const el = document.activeElement as HTMLElement | null;
	if (!el) return false;
	const tag = el.tagName;
	if (tag === 'INPUT' || tag === 'TEXTAREA') {
		return true;
	}
	if ((el as HTMLElement).isContentEditable) {
		return true;
	}
	return false;
}

window.addEventListener("keydown", (event) => {
	// ignore movement keys when typing in an input/textarea or contenteditable
	if (isTyping()) return;
	
	// Player 1 controls (WASD) - always available in offline mode, or when user is team 1
	if (event.key === "w" || event.key === "W") {
		upPlayer1 = true;
	}
	if (event.key === "s" || event.key === "S") {
		downPlayer1 = true;
	}
	
	// Player 2 controls (Arrow keys) - only in offline mode, or when user is team 2
	if (event.key === "ArrowUp") {
		if (mode === '1v1Offline') {
			upPlayer2 = true;
		} else if (team === 2) {
			upPlayer2 = true;
		}
	}
	if (event.key === "ArrowDown") {
		if (mode === '1v1Offline') {
			downPlayer2 = true;
		} else if (team === 2) {
			downPlayer2 = true;
		}
	}
});

window.addEventListener("keyup", (event) => {
	if (isTyping()) return;
	
	// Player 1 controls (WASD)
	if (event.key === "w" || event.key === "W") {
		upPlayer1 = false;
	}
	if (event.key === "s" || event.key === "S") {
		downPlayer1 = false;
	}
	
	// Player 2 controls (Arrow keys)
	if (event.key === "ArrowUp") {
		upPlayer2 = false;
	}
	if (event.key === "ArrowDown") {
		downPlayer2 = false;
	}
});

function draw() {
	console.log("draw() called - Ball position:", ballX, ballY, "Paddle positions:", posYPlayer1, posYPlayer2); // DEBUG
	ctx.clearRect(0, 0, width, height);
	ctx.fillStyle = "rgb(254, 243, 199)";

	ctx.fillRect(posXPlayer1 - paddleWidth / 2, posYPlayer1 - paddleHeight / 2, paddleWidth, paddleHeight);
	ctx.fillRect(posXPlayer2 - paddleWidth / 2, posYPlayer2 - paddleHeight / 2, paddleWidth, paddleHeight);

	ctx.beginPath();
	ctx.arc(ballX, ballY, ballRadius, 0, Math.PI * 2);
	ctx.fill();
	ctx.closePath();

	const player1Name = sessionStorage.getItem("player1Name") || i18n.t("player1");
	const player2Name = sessionStorage.getItem("player2Name") || i18n.t("playerTwo");

	ctx.font = "20px Arial";
	ctx.fillStyle = "rgb(254, 243, 199)";
	ctx.textAlign = "center";

	ctx.fillText(player1Name, width * 0.25, 80);
	ctx.fillText(player2Name, width * 0.75, 80);

	ctx.font = "40px Arial";
	ctx.fillStyle = "rgb(254, 243, 199)";
	ctx.textAlign = "center";

	ctx.fillText(player1Score.toString(), width * 0.25, 50);
	ctx.fillText(player2Score.toString(), width * 0.75, 50);

}

function sendInput() {
	if (!socket || !started) return;

	// For 1v1Offline mode, send input for both players
	if (mode === '1v1Offline') {
		// Send player 1 input (WASD keys)
		socket.send(JSON.stringify({
			type: "input",
			game: gameId,
			team: 1,
			up: upPlayer1,
			down: downPlayer1
		}));
		
		// Send player 2 input (Arrow keys)
		socket.send(JSON.stringify({
			type: "input",
			game: gameId,
			team: 2,
			up: upPlayer2,
			down: downPlayer2
		}));
	} else {
		// For online modes, send input for the current player's team only
		socket.send(JSON.stringify({
			type: "input",
			game: gameId,
			team: team || 1,
			up: (team === 1 ? upPlayer1 : upPlayer2),
			down: (team === 1 ? downPlayer1 : downPlayer2)
		}));
	}
}

function remoteGameLoop() {
	console.log("remoteGameLoop called, started:", started, "gameId:", gameId, "positions:", {ballX, ballY, posYPlayer1, posYPlayer2}); // DEBUG
	draw();
	sendInput();
	if (started)
		requestAnimationFrame(remoteGameLoop);
	else
		console.log("Game loop stopped, started is false"); // DEBUG
}
