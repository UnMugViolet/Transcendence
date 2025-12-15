 import { BACKEND_URL } from "../utils/config.js";
 import { handleGameRemote } from "../game/game.js";
 import { openFriendProfile } from "../user/profile.js";
 import { i18n } from "../utils/i18n.js";

 export let ws: WebSocket | null = null;

 const globalChatMessages = document.getElementById("chatMessages") as HTMLElement;
 const globalChatForm = document.getElementById("chatForm") as HTMLFormElement;
 const globalChatInput = document.getElementById("chatInput") as HTMLInputElement;

 globalChatForm.addEventListener("submit", (e) => {
	e.preventDefault();
	const message = globalChatInput.value.trim();
	const partyId = sessionStorage.getItem("partyId");
	if (!partyId) {
		alert(i18n.t("notInParty"));
		return;
	}
	if (!message || !ws || ws.readyState !== WebSocket.OPEN) {
		console.warn("WebSocket not connected or message empty");
		return;
	}

	ws.send(JSON.stringify({
		type: "party",
		to: sessionStorage.getItem("partyId"),
		message
	}));

	const msgDiv = document.createElement("div");
	msgDiv.className = "text-right my-1";
	msgDiv.textContent = message;
	globalChatMessages.appendChild(msgDiv);
	globalChatMessages.scrollTop = globalChatMessages.scrollHeight;
	globalChatInput.value = "";
 });

 export function initChatSocket(token: string, onReady?: () => void) {
	// If the WS exists and is already opened with the same token context, do nothing
    if (ws && ws.readyState === WebSocket.OPEN) {
        console.log("WebSocket already connected");
        if (onReady) onReady();
        return;
    }
    
    // Close existing connection if it's in a bad state
    if (ws && ws.readyState !== WebSocket.CLOSED) {
        console.log("Closing existing WebSocket connection");
        ws.close();
        ws = null; // Set to null immediately to allow new connection
    }
    
	// Clear global chat messages
	if (globalChatMessages) globalChatMessages.innerHTML = "";

	console.log("Creating new WebSocket connection...");
	// Encode the token to avoid '+' and other special characters breaking the query string
	const encodedToken = encodeURIComponent(token);
	ws = new WebSocket(`${BACKEND_URL.replace("http", "ws")}/ws?token=${encodedToken}`);
	
	ws.onopen = () => {
		console.log("WebSocket connected");
		if (onReady) onReady();
	};
	
	ws.onmessage = async (event) => {
		const msg = JSON.parse(event.data);
		// console.log("WebSocket message received:", msg); // DEBUG
		
		if (msg.type === 'party') {
			const msgDiv = document.createElement("div");
			msgDiv.className = "text-left my-1 text-sm text-yellow-300";
			msgDiv.textContent = `${msg.fromName || "Player"}: ${msg.message}`;
			globalChatMessages.appendChild(msgDiv);
			globalChatMessages.scrollTop = globalChatMessages.scrollHeight;
		} else {
			try {
				// console.log("Trying to handle game message:", msg); // DEBUG
				const handled = await handleGameRemote(msg);
				// console.log("Game message handled:", handled); // DEBUG
				if (!handled) 
					receiveMessage(msg);
			} catch (err) {
				console.error("Error parsing WebSocket message:", err);
			}	
		}
	};
	
	ws.onclose = (event) => {
		console.log("WebSocket disconnected", event.code, event.reason);
		ws = null;
	};
	
	ws.onerror = (err) => {
		console.error("WebSocket error:", err);
	};
 }

export function closeChatSocket() {
  if (ws) {
    ws.close();
    ws = null;
  }
}

// Ensure the socket is properly closed on page unload to trigger server-side cleanup
window.addEventListener("beforeunload", () => {
	try { ws?.close(); } catch (_) {}
});
	
async function loadHistory(friendId: number, messageEl: HTMLElement) {
	const token = sessionStorage.getItem("token");
	if (!token) return;
	
	const res = await fetch (`${BACKEND_URL}/messages/${friendId}`, {
		method: "GET",
		headers: {
			"Authorization": `Bearer ${token}`
		}
	});
	const data = await res.json();
	if (!res.ok) throw new Error(data.error || i18n.t("errorHistory"));

	const chatWindow = document.getElementById(`chat-window-${friendId}`);
	if (!chatWindow) return;

	messageEl = chatWindow.querySelector("div.flex-1") as HTMLElement;
	messageEl.innerHTML = "";
	const userId = Number(sessionStorage.getItem("userId"));
	data.messages.forEach((msg: any) => {
		const msgDiv = document.createElement("div");
		if (Number(msg.sender_id) === userId)
			msgDiv.className = "text-right my-1";
		else
			msgDiv.className = "text-left my-1";
		msgDiv.textContent = msg.message;
		messageEl.appendChild(msgDiv);
	});
	messageEl.scrollTop = messageEl.scrollHeight;
}

function sendMessageWS(to: number, message: string) {
	if (!ws || ws.readyState !== WebSocket.OPEN){
		console.log("WebSocket not connected: ", ws?.readyState);
		return;
	}

	const msg = {
		type: "private",
		to,
		message,
	};
	ws.send(JSON.stringify(msg));

	const chatWindow = document.getElementById(`chat-window-${to}`);
	if (chatWindow) {
		const messages = chatWindow.querySelector("div.flex-1") as HTMLElement;
		const msgDiv = document.createElement("div");
		msgDiv.className = "text-right my-1";
		msgDiv.textContent = message.trim();
		messages.appendChild(msgDiv);
		messages.scrollTop = messages.scrollHeight;
	}
}

async function receiveMessage(msg: any) {
	if (msg.type !== "private") return;

	const friendId = msg.from;
	let friendName = i18n.t("friend");
	let friendPfp = "default.png";

	try {
		const res = await fetch(`${BACKEND_URL}/users/${friendId}`, {
			headers: { "Authorization": `Bearer ${sessionStorage.getItem("token")}` }
		});
		const data = await res.json();
		if (res.ok) {
			friendName = data.name || friendName;
			friendPfp = data.profile_picture || friendPfp
		}
	} catch (err) {
		console.error("Error fetching user info:", err);
	}

	openChatWindow(friendId, friendName, friendPfp);

	const chatWindow = document.getElementById(`chat-window-${friendId}`);
	if (chatWindow) {
		const messages = chatWindow.querySelector("div.flex-1") as HTMLElement;
		const msgDiv = document.createElement("div");
		msgDiv.className = "text-left my-1";
		msgDiv.textContent = msg.message;
		messages.appendChild(msgDiv);
		messages.scrollTop = messages.scrollHeight;
	}
}

async function invitePlayer(friendId: number) {
	const token = sessionStorage.getItem("token");
	if (!token) return;
	const currentPartyId = sessionStorage.getItem("partyId");
	console.log("Current Party ID:", currentPartyId);

	try {
		const res = await fetch(`${BACKEND_URL}/invite`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Bearer ${token}`
			},
			body: JSON.stringify({ 
			inviteeId: friendId,
			partyId: currentPartyId
			})
		});
		const data = await res.json();

		if (res.ok && data.success) {
			alert(`${i18n.t("invitationSent")} ${data.inviteeName}`);
		} else {
			alert(`${i18n.t("error")} ${data.error}`);
		}
	} catch (error) {
		console.error("Error sending invitation:", error);
	}
}

// Fonction pour ouvrir une fenêtre de chat en bas de l'écran
export function openChatWindow(friendId: number, friendName: string, friendPfp: string) {
	// Vérifie si une fenêtre de chat existe déjà pour cet ami
	let chatWindow = document.getElementById(`chat-window-${friendId}`);
	if (chatWindow) {
		chatWindow.classList.remove("hidden");
		return chatWindow.querySelector("div.flex-1") as HTMLElement;
	}
	// Crée la fenêtre de chat
	chatWindow = document.createElement("div");
	chatWindow.id = `chat-window-${friendId}`;
	chatWindow.className =
	"fixed bottom-4 right-4 w-80 bg-gray-800 text-white rounded-lg shadow-lg z-50 flex flex-col";
	// Header
	const header = document.createElement("div");
	header.className = "flex items-center p-2 bg-gray-900 rounded-t-lg";

	const userInfo = document.createElement("div");
	userInfo.className = "flex items-center gap-2";
	const img = document.createElement("img");
	img.src = `${BACKEND_URL}/img/${friendPfp}`;
    img.className = "w-8 h-8 rounded-full object-cover";
    img.style.objectPosition = "center";
	const name = document.createElement("span");
	name.textContent = friendName;
	name.className = "cursor-pointer hover:underline";

	name.addEventListener("click", () => {
		openFriendProfile(friendId);
	});

	userInfo.appendChild(img);
	userInfo.appendChild(name);

	const actions = document.createElement("div");
	actions.className = "flex items-center gap-2 ml-auto";

	const inviteBtn = document.createElement("button");
	inviteBtn.setAttribute("data-i18n", "invite");
	inviteBtn.textContent = i18n.t("invite");
	inviteBtn.className = "bg-green-500 hover:bg-green-400 text-white px-2 py-1 rounded text-sm";
	inviteBtn.addEventListener("click", () => {
		invitePlayer(friendId);
	});

	const closeBtn = document.createElement("button");
	closeBtn.innerHTML = "&times;";
	closeBtn.className = "text-xl hover:text-red-400";
	closeBtn.addEventListener("click", () => {
		chatWindow?.classList.add("hidden");
	});

	actions.appendChild(inviteBtn);
	actions.appendChild(closeBtn);

	header.appendChild(userInfo);
	header.appendChild(actions);

	// Messages
	const messages = document.createElement("div");
	messages.className = "flex-1 p-2 overflow-y-auto";
	messages.style.maxHeight = "300px";
	messages.innerHTML = "<div class='text-gray-400 text-sm'>Nouveau chat</div>";

	// Input
	const inputContainer = document.createElement("div");
	inputContainer.className = "flex p-2 border-t border-gray-700";
	const input = document.createElement("input");
	input.type = "text";
	input.autocomplete = "off";
	input.setAttribute("data-i18n-placeholder", "messagePlaceholder");
	input.placeholder = i18n.t("messagePlaceholder");
	input.className = "flex-1 bg-gray-700 text-white rounded px-2 py-1 outline-none";

	const sendBtn = document.createElement("button");
	sendBtn.setAttribute("data-i18n", "send");
	sendBtn.textContent = i18n.t("send");
	sendBtn.className = "ml-2 bg-blue-500 hover:bg-blue-400 text-white px-3 py-1 rounded";

	sendBtn.addEventListener("click", () => {
	if (input.value.trim()) {
		sendMessageWS(friendId, input.value);
		input.value = "";
		}
	});

	input.addEventListener("keydown", (e) => {
	if (e.key === "Enter") sendBtn.click();
	});

	inputContainer.appendChild(input);
	inputContainer.appendChild(sendBtn);

	chatWindow.appendChild(header);
	chatWindow.appendChild(messages);
	chatWindow.appendChild(inputContainer);

	// Ajoute la fenêtre de chat au body
	document.body.appendChild(chatWindow);
	i18n.updateDOM();
	loadHistory(friendId, messages);

	// Positionne toutes les fenêtres de chat ouvertes côte à côte sans chevauchement
	const chatWindows = Array.from(document.querySelectorAll("[id^='chat-window-']:not(.hidden)")) as HTMLElement[];
	chatWindows.forEach((win, idx) => {
		win.style.right = `${16 + idx * (320 + 16)}px`; // 320px largeur + 16px espace
		win.style.bottom = "16px";
	});
	return messages;
}
