import { BACKEND_URL } from "../utils/config.js";
import { getWs, initChatSocket} from "../user/chat.js";
import { handleRoute, UserManager } from "../index.js";
import { i18n } from "../utils/i18n.js";
import { AuthManager } from "../user/auth.js";

const pong = document.getElementById('pongCanvas') as HTMLCanvasElement | null;
const pongMenu = document.getElementById('pongMenu') as HTMLDivElement | null;
const backToMenu = document.getElementById('backToMenu') as HTMLButtonElement | null;
const btnLeaveGame = document.getElementById('btnLeaveGame') as HTMLButtonElement | null;

let mode: string = '';

export function initPongBtns() {
	const btnOffline = document.getElementById('btnOffline') as HTMLButtonElement | null;
	const btnOnline = document.getElementById('btnOnline') as HTMLButtonElement | null;
	const btnTournament = document.getElementById('btnTournament') as HTMLButtonElement | null;
	const btnIA = document.getElementById('btnIA') as HTMLButtonElement | null;

	let userLoggedIn = UserManager.isUserLoggedIn();
	let isDemoUser = UserManager.isUserDemo();

	// Show offline and IA buttons for everyone
	btnOffline?.classList.add('flex');
	btnOffline?.classList.remove('hidden');
	btnIA?.classList.add('flex');
	btnIA?.classList.remove('hidden');

	// Show online and tournament buttons only for authenticated users (not demo users)
	if (userLoggedIn && !isDemoUser) {
		btnOnline?.classList.add('flex');
		btnOnline?.classList.remove('hidden');
		btnTournament?.classList.add('flex');
		btnTournament?.classList.remove('hidden');
	} else {
		btnOnline?.classList.add('hidden');
		btnOnline?.classList.remove('flex');
		btnTournament?.classList.add('hidden');
		btnTournament?.classList.remove('flex');
	}


	if (btnOffline) {
		btnOffline.onclick = async () => {
			mode = '1v1Offline';
			
			// Ensure user is ready (create demo user if needed)
			const userReady = await AuthManager.ensureUserReady();
			if (userReady) {
				// Close old socket if it exists, to force reconnection with new token
				const socket = getWs();
				if (socket && socket.readyState === WebSocket.OPEN) {
					socket.close();
				}
				joinGame(mode);
			} else {
				console.error("Failed to prepare user for offline play");
			}
		};
	}
	if (btnOnline && userLoggedIn && !isDemoUser) {
		btnOnline.onclick = () => {
			mode = '1v1Online';
			joinGame(mode);
		};
	}
	if (btnTournament && userLoggedIn && !isDemoUser) {
		btnTournament.onclick = () => {
			mode = 'Tournament';
			joinGame(mode);
		};
	}
	if (btnIA) {
		btnIA.onclick = async () => {
			mode = 'IA';

			const userReady = await AuthManager.ensureUserReady();
			if (userReady) {
				// Close old socket if it exists, to force reconnection with new token
				const socket = getWs();
				if (socket && socket.readyState === WebSocket.OPEN) {
					socket.close();
				}
				joinGame(mode);
			} else {
				console.error("Failed to prepare user for offline play");
			}
		};
	}
}

/**
 * Function to leave the current game and reset state of the game module
 * @param options Options to control behavior on leaving
 * @returns void
 */
export async function leaveGame(options: { navigate?: boolean; closeSocket?: boolean; resetState?: boolean } = {}) {
    const opts = { navigate: true, closeSocket: true, resetState: true, ...options };
    let token = AuthManager.getToken();
    if (!token) {
        console.warn("No token found, cannot leave game.");
        return;
    } 

    let leaveSuccess = false;
    try {
        const response = await fetch(`${BACKEND_URL}/leave`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
        });
        leaveSuccess = response.ok;
        if (!response.ok) {
            const data = await response.json();
            console.warn("Leave game response:", data);
        }
    } catch (err) {
        console.error("Error Leave Game:", err);
    }

    // Clear all active game timers
    clearGameTimers();

    // Only close socket after leave request has been processed by backend
    if (opts.closeSocket && leaveSuccess) {
        // Small delay to ensure backend has fully processed the leave
        await new Promise(resolve => setTimeout(resolve, 100));
        getWs()?.close();
    } else if (opts.closeSocket) {
        getWs()?.close();
    }

    if (opts.resetState) {
        gameId = 0;
        team = 0;
        started = false;
        // hide local lobby options when leaving
        const lobbyLocalOptions = document.getElementById('lobbyLocalOptions');
        const lobby = document.getElementById('lobby');
        const startBtn = document.getElementById('btnStart');
        const backBtn = document.getElementById('backToMenu');
        const viewGame = document.getElementById('viewGame');

        if (lobbyLocalOptions && lobby && startBtn && backBtn) {
            lobbyLocalOptions.classList.add('hidden');
            lobby.classList.add('hidden');
            startBtn.classList.add('hidden');
            backBtn.classList.add('hidden');
        }
        
        // Explicitly hide the game view
        if (viewGame) {
            viewGame.classList.add('hidden');
            viewGame.classList.remove('flex');
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

let width = pong.width;
let height = pong.height;
const ctx = pong.getContext('2d') as CanvasRenderingContext2D;

let paddleWidth = 0.01 * width;
let paddleHeight = 0.16 * height;
let ballRadius = 0.01 * width;

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

// Local simulation state (used for 1v1Offline and IA modes)
// Local simulation variables removed; backend is authoritative for all modes

let ballX = width / 2;
let ballY = height / 2;

let started = false;
export let gameId = 0;
let team = 0;

let pauseInterval: any;
let countdownInterval: any;
let lastServerUpdateTs = 0;
let warnedNoServerUpdates = false;

/**
 * Clears all active game intervals and timers
 */
function clearGameTimers() {
	if (pauseInterval) {
		clearInterval(pauseInterval);
		pauseInterval = undefined;
	}
	if (countdownInterval) {
		clearInterval(countdownInterval);
		countdownInterval = undefined;
	}
}

const modalGamePause = document.getElementById("modalGamePause");
const modalReconnect = document.getElementById("modalReconnect");

const yes = document.getElementById("btnReconnectYes");
const no = document.getElementById("btnReconnectNo");
const start = document.getElementById("btnStart");
const goodBye = document.getElementById("goodBye");

// Track if we're handling a popstate-triggered leave (for offline/IA modes)
let pendingPopstateLeave = false;

/**
 * Shows the goodbye message and leaves the game
 * @param options Options to pass to leaveGame
 */
async function showGoodbyeAndLeave(options: { navigate?: boolean; closeSocket?: boolean; resetState?: boolean } = {}) {
    // Hide the game view first
    const viewGame = document.getElementById('viewGame');
    if (viewGame) {
        viewGame.classList.add('hidden');
        viewGame.classList.remove('flex');
    }
    // Show lobby with goodbye message
    const lobby = document.getElementById('lobby');
    if (lobby) {
        lobby.classList.remove('hidden');
        lobby.classList.add('flex');
    }
    // Show the "Thanks for playing" message briefly before returning to menu
    goodBye?.classList.remove("hidden");
    await sleep(1500);
    await leaveGame(options);
}

// Set up Start button click handler for offline/IA games
if (start) {
	start.addEventListener('click', async () => {
		
		// Send start request to backend with the current mode
		const token = AuthManager.getToken();
		if (!token) {
			console.error("No token found, cannot start game");
			return;
		}
		
		try {
			const res = await fetch(`${BACKEND_URL}/start`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${token}`
				},
				body: JSON.stringify({ mode })
			});
			
			if (!res.ok) {
				const error = await res.json();
				console.error("Error starting game:", error);
				const startMessage = document.getElementById('startMessage');
				if (startMessage) {
					startMessage.textContent = error.error || 'Failed to start game';
					startMessage.classList.remove('hidden');
				}
				return;
			}
			
			console.log("Game start request sent successfully");
		} catch (err) {
			console.error("Error sending start request:", err);
		}
	});
}

// Ensure canvas matches its visible size and recompute layout-dependent values
function resizeCanvas(recenter: boolean = false) {
	if (!pong) return;

	const prevWidth = width;
	const prevHeight = height;

	// Update canvas pixel size to match CSS size (when visible)
	const newClientWidth = pong.clientWidth || prevWidth || 800;
	const newClientHeight = pong.clientHeight || prevHeight || 600;
	pong.width = newClientWidth;
	pong.height = newClientHeight;

	width = pong.width;
	height = pong.height;

	// Recompute sizes based on new dimensions
	paddleWidth = 0.01 * width;
	paddleHeight = 0.16 * height;
	ballRadius = Math.max(1, 0.01 * width); // ensure visible even on tiny widths

	// Keep paddles at 5% from edges
	posXPlayer1 = 0.05 * width;
	posXPlayer2 = width - 0.05 * width;

	if (recenter || !prevWidth || !prevHeight) {
		// Center everything if requested or if we didn't have previous dimensions
		posYPlayer1 = height / 2;
		posYPlayer2 = height / 2;
		ballX = width / 2;
		ballY = height / 2;
	} else {
		// Preserve relative Y positions across resizes
		const y1Ratio = posYPlayer1 / prevHeight;
		const y2Ratio = posYPlayer2 / prevHeight;
		posYPlayer1 = y1Ratio * height;
		posYPlayer2 = y2Ratio * height;

		// Keep ball position proportional as well
		const bxRatio = ballX / prevWidth;
		const byRatio = ballY / prevHeight;
		ballX = bxRatio * width;
		ballY = byRatio * height;
	}
}

resizeCanvas(true);

// Keep canvas in sync on window resize
globalThis.addEventListener('resize', () => resizeCanvas(false));

// Pour que le popstate soit trigger seulement quand l'utilisateur clique sur le bouton retour du navigateur
export let isInternalNavigation = false;

export function navigateTo(viewId: string, replace = false) {
	try {
		isInternalNavigation = true;
		if (replace) {
			history.replaceState({ page: viewId }, "", '#' + viewId);
		} else {
			globalThis.location.hash = '#' + viewId;
		}
		setTimeout(() => {
			isInternalNavigation = false;
		}, 100);
	} catch (error) {
		console.error("ERROR in navigateTo:", error);
		throw error;
	}
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

globalThis.addEventListener('hashchange', () => {
	if (location.hash !== '#lobby') {
		hideLobbyUI();
	}
});

// A revoir ?
globalThis.addEventListener("popstate", async (event) => {
	if (isInternalNavigation) {
		return;
	}

	if (started && (mode === '1v1Offline' || mode === 'IA' || mode === '1v1Online' || mode === 'Tournament')) {
		event.preventDefault();
		// Mark that we're handling a popstate leave
		pendingPopstateLeave = true;
		started = false;
		modalReconnect?.classList.remove("hidden");
		if (mode === '1v1Online' || mode === 'Tournament') {
			getWs()?.close();
		}
		isInternalNavigation = true;
		setTimeout(() => (isInternalNavigation = false), 100);
	}
});

btnLeaveGame?.addEventListener('click', async () => {
    console.log("Leaving game...");
    await showGoodbyeAndLeave();
});

backToMenu?.addEventListener("click", async () => {
    console.log("Leaving game...");
    await showGoodbyeAndLeave();
});


no?.addEventListener("click", async () => {
	modalReconnect?.classList.add("hidden");
	console.log("Leaving game...");

	// Handle popstate-triggered leave for offline/IA modes
	if (pendingPopstateLeave && (mode === '1v1Offline' || mode === 'IA')) {
		pendingPopstateLeave = false;
		await showGoodbyeAndLeave({ navigate: false, resetState: true });
		await endingGame({ winner: 0, mode: mode });
		isInternalNavigation = true;
		history.replaceState(null, "", "#pongMenu");
		handleRoute();
		setTimeout(() => (isInternalNavigation = false), 100);
	} else {
		pendingPopstateLeave = false;
		await showGoodbyeAndLeave();
	}
});

yes?.addEventListener("click", async () => {
	modalReconnect?.classList.add("hidden");

	// For offline/IA modes triggered by popstate, "yes" means stay in game
	if (pendingPopstateLeave && (mode === '1v1Offline' || mode === 'IA')) {
		pendingPopstateLeave = false;
		isInternalNavigation = true;
		navigateTo('viewGame', true);
		handleRoute();
		started = true;
		setTimeout(() => (isInternalNavigation = false), 100);
		return;
	}

	// For online modes, "yes" means reconnect/resume
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

	started = true;
});

start?.addEventListener("click", async () => {
	let token = AuthManager.getToken();
	if (!token) {
		return;
	}

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

		if (!res.ok) {
			// Use backend message if provided
			throw new Error(data?.error ? data.error : i18n.t("failedStart"));
		}

		if (data.players) {
			const p1 = (data.players as Array<any>).find(p => p.team === 1);
			const p2 = (data.players as Array<any>).find(p => p.team === 2);
			if (p1) {
				sessionStorage.setItem("player1Name", p1.name);
			}
			if (p2) {
				sessionStorage.setItem("player2Name", p2.name);
			}
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
			setTimeout(async () => {
				if (!started) {
					started = true;

					// Explicitly set and verify each variable
					posYPlayer1 = height / 2;
					posYPlayer2 = height / 2;
					ballX = width / 2;
					ballY = height / 2;
					
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

// Local round reset logic removed. Backend handles all physics, scoring and round resets.

//demarrer la partie pour tous les joueurs 
async function startingGame(resume = false, timer = true) {
	console.log("startingGame called, resume:", resume, "timer:", timer); // DEBUG
	console.log("Game is starting!");
	navigateTo('viewGame');
	// Ensure canvas has non-zero size now that the view should be visible
	resizeCanvas(true);
	// One more pass on next frame to catch freshly-laid-out size
	setTimeout(() => resizeCanvas(false), 0);
	ctx.clearRect(0, 0, width, height);
	// Dynamic font sizes based on canvas height
	const messageFont = Math.max(28, Math.floor(height * 0.08)); // ~8% of height
	const countdownFont = Math.max(48, Math.floor(height * 0.2)); // ~20% of height
	ctx.font = `${messageFont}px Arial`;
	ctx.fillStyle = "rgb(254, 243, 199)";
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	if (timer) {
		// Display the starting message
		const startMessage = resume ? i18n.t("gameResumes") : i18n.t("gameStarts");
		ctx.fillText(startMessage, width / 2, height / 2 - 40);
		
		let countdown = 5;
		countdownInterval = setInterval(() => {
			// Clear the entire canvas and redraw everything for clean display
			ctx.clearRect(0, 0, width, height);
			
			// Redraw the starting message
			ctx.fillStyle = "rgb(254, 243, 199)";
			ctx.font = `${messageFont}px Arial`;
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillText(startMessage, width / 2, height / 2 - 40);
			
			// Draw the countdown number
			ctx.fillStyle = "rgb(239, 68, 68)";
			ctx.font = `${countdownFont}px Arial`;
			ctx.fillText(countdown.toString(), width / 2, height / 2 + 40);
			
			countdown--;
			if (countdown < 0) {
				clearInterval(countdownInterval);
				countdownInterval = undefined;
				ctx.clearRect(0, 0, width, height);
			}
		}, 1000);
	}
	// Wait for countdown to finish before starting the game loop
	await sleep(6000);
	
	// Backend is authoritative; no local simulation

	// No local physics initialization; relying on backend updates
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
		if (pauseSeconds <= 0) {
			clearInterval(pauseInterval);
		}
	}, 1000);
}

export async function handleGameRemote(data: any) {
	
	if (data.type === "start" && !started) {
		modalGamePause?.classList.add("hidden");
		if (pauseInterval) {
			clearInterval(pauseInterval);
		}
		const resume = data.resume || false;
		const timer = data.timer || true;
		gameId = data.game;
		team = data.team;


		if (data.players && Array.isArray(data.players)) {
			const p1 = (data.players as Array<any>).find(p => p.team === 1);
			const p2 = (data.players as Array<any>).find(p => p.team === 2);
			if (p1?.name) {
				sessionStorage.setItem('player1Name', p1.name);
			}
			if (p2?.name) {
				sessionStorage.setItem('player2Name', p2.name);
			}
		}

		started = true;
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
		lastServerUpdateTs = performance.now();
		warnedNoServerUpdates = false;
				
		posYPlayer1 = value.paddle1Y * height;
		posYPlayer2 = value.paddle2Y * height;
		ballX = value.ballX * width;
		ballY = value.ballY * height;
		player1Score = value.score1;
		player2Score = value.score2;
		
		return true;
	}
	return false;
};

/**
 * Sends a join request to the backend and handles retries if already in a game
 */
async function sendJoinRequest(token: string, gameMode: string): Promise<any> {
	let res = await fetch(`${BACKEND_URL}/join`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"Authorization": `Bearer ${token}`
		},
		body: JSON.stringify({ mode: gameMode })
	});

	let data = await res.json();
	console.log("Join Game Response:", data);

	if (!res.ok) {
		// If already in a game, attempt a quick leave and retry once
		if (data?.error && typeof data.error === 'string' && data.error.includes('already in a game')) {
			console.warn('Already in a game, attempting to leave and retry join...');
			try {
				await fetch(`${BACKEND_URL}/leave`, {
					method: 'POST',
					headers: { Authorization: `Bearer ${token}` }
				});
			} catch (_) {}
			
			// Retry join once
			res = await fetch(`${BACKEND_URL}/join`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
				body: JSON.stringify({ mode: gameMode })
			});
			data = await res.json();
			console.log('Join Retry Response:', data);
			
			if (!res.ok) {
				throw new Error(data.error || i18n.t('failedJoin'));
			}
		} else {
			throw new Error(data.error || i18n.t('failedJoin'));
		}
	}

	return data;
}

/**
 * Stores game session data (party ID and team) in sessionStorage
 */
function storeGameSessionData(data: any): void {
	if (data.partyId) {
		sessionStorage.setItem("partyId", data.partyId.toString());
		console.log("Joined Party ID:", data.partyId);
	}
	if (data.team) {
		sessionStorage.setItem("team", data.team);
	}
}

/**
 * Draws the appropriate message on canvas based on game mode
 */
function drawGameReadyMessage(gameMode: string): void {
	ctx.clearRect(0, 0, width, height);
	ctx.font = "40px Arial";
	ctx.fillStyle = "rgb(254, 243, 199)";
	ctx.textAlign = "center";

	if (gameMode === '1v1Offline') {
		ctx.fillText(i18n.t("offlineGameReady") || "", width / 2, height / 2);
	} else if (gameMode === 'IA') {
		ctx.fillText(i18n.t("aiGameReady") || "AI Game Ready - Click Start to Play!", width / 2, height / 2);
	} else {
		ctx.fillText(i18n.t("waitingOpponent"), width / 2, height / 2);
	}
}

/**
 * Configures lobby UI visibility based on game mode
 */
function configureLobbyUI(gameMode: string): void {
	const lobby = document.getElementById("lobby");
	const lobbyLocalOptions = document.getElementById('lobbyLocalOptions');
	const player2Input = document.getElementById('lobbyPlayer2Name') as HTMLInputElement | null;

	// Handle lobby visibility
	if (gameMode !== 'IA') {
		if (lobby) {
			lobby.classList.remove("hidden");
			lobby.classList.add("flex");
		}
		navigateTo('lobby');
	} else {
		if (lobby) {
			lobby.classList.add("hidden");
			lobby.classList.remove("flex");
		}
		navigateTo('viewGame');
		// Auto-start IA mode
		const startBtn = document.getElementById('btnStart');
		if (startBtn) {
			startBtn.click();
		}
	}

	// Show/hide local lobby options
	if ((gameMode === '1v1Offline' || gameMode === 'IA') && lobbyLocalOptions) {
		lobbyLocalOptions.classList.remove('hidden');
		lobbyLocalOptions.classList.add('flex');
		
		// Show player 2 name input for offline mode
		if (gameMode === '1v1Offline' && player2Input) {
			player2Input.style.display = 'block';
		}
	} else if (lobbyLocalOptions) {
		lobbyLocalOptions.classList.add('hidden');
	}
}

/**
 * Displays game control buttons (start, back, goodbye)
 */
function showGameControlButtons(): void {
	const startBtn = document.getElementById('btnStart');
	if (startBtn) {
		startBtn.classList.remove("hidden");
		startBtn.classList.add("flex");
	}
	if (backToMenu) {
		backToMenu.classList.remove("hidden");
	}
	goodBye?.classList.add("hidden");
}

/**
 * Prepares the game environment (initializes socket, clears UI, etc.)
 */
async function prepareGameEnvironment(token: string): Promise<void> {
	// Initialize chat socket for real-time communication
	await new Promise<void>((resolve) => {
		initChatSocket(token, resolve);
	});

	// Clear global chat messages
	const globalChatMessages = document.getElementById("globalChatMessages");
	if (globalChatMessages) {
		globalChatMessages.innerHTML = "";
	}

	// Clear any previous error messages
	const startMessage = document.getElementById('startMessage') as HTMLElement | null;
	if (startMessage) {
		startMessage.textContent = '';
		startMessage.classList.add('hidden');
	}
}

/**
 * Hides the pong menu when entering a game
 */
function hidePongMenu(): void {
	const pongMenu = document.getElementById('pongMenu') as HTMLDivElement | null;
	if (pongMenu) {
		pongMenu.classList.add('hidden');
	}
}

/**
 * Main join game function with separation of concerns
 */
async function joinGame(gameMode: string) {
	let token = AuthManager.getToken();

	if (!token) {
		console.error("No token found, cannot join game. User should have called ensureUserReady first.");
		return;
	}

	try {
		hidePongMenu();
		await prepareGameEnvironment(token);
		
		const joinData = await sendJoinRequest(token, gameMode);

		// Handle rejoin case - don't proceed with UI setup
		const isRejoin = joinData?.message?.includes('Rejoined');
		if (isRejoin) {
			console.log("Rejoined active party, waiting for game state...");
			await new Promise(resolve => setTimeout(resolve, 500));
			return;
		}

		// Set up game state
		storeGameSessionData(joinData);

		// Configure UI based on game mode
		drawGameReadyMessage(gameMode);
		configureLobbyUI(gameMode);
		showGameControlButtons();
	} catch (err) {
		console.error("Error Join Game:", err);
	}
}

function isTyping() {
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

globalThis.addEventListener("keydown", (event) => {
	// ignore movement keys when typing in an input/textarea or contenteditable
	if (isTyping()) {
		return ;
	}
	
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

globalThis.addEventListener("keyup", (event) => {
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
	const socket = getWs();
	if (!socket || !started) return;

	if (mode === '1v1Offline') {
		// Send inputs for both paddles from one client (shared keyboard)
		socket.send(JSON.stringify({ type: "input", game: gameId, team: 1, up: upPlayer1, down: downPlayer1 }));
		socket.send(JSON.stringify({ type: "input", game: gameId, team: 2, up: upPlayer2, down: downPlayer2 }));
	} else {
		// Online and IA: send only assigned team input; backend moves AI when needed
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
	// When not simulating locally, only draw current server-fed positions and send input periodically.
	draw();
	sendInput();

	if (started) requestAnimationFrame(remoteGameLoop);
}
