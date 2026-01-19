import { ApiClient } from "../utils/api.js";
import { BACKEND_URL } from "../utils/config.js";
import type { ApiResponse, UserStats, RecentGame } from "../types/types.js";
import { Router } from "../route/router.js";
import { i18n } from "../utils/i18n.js";
import { navigateTo } from "../game/game.js";


export async function getUserStats(): Promise<UserStats> {
  const res = await ApiClient.get(`${BACKEND_URL}/stats/me`);

  const json: ApiResponse<UserStats> = await res.json();

  if (!res.ok || !json.data) {
    throw new Error(json.error || "Failed to load user stats");
  }

  return json.data;
}

// ---- USER DASHBOARD --- //

export async function loadUserDashboard() {
  const view = document.getElementById("userDashboard");
  const content = document.getElementById("dashboardContent");
  

  if (!view || !content) return;

  Router.showView("userDashboard");
  content.innerHTML = `<p class="text-amber-200">Loading stats...</p>`;

  try {
    const stats = await getUserStats();
    const myId = Number(localStorage.getItem("userId"));

    content.innerHTML = `
        ${statsCards(stats)}
        ${winRateWidget(stats)}
        ${recentGameWidget(stats, myId)}
        ${graphicWidget(stats)}
    `;

    i18n.updateDOM();
    document.getElementById("dashboardBack")?.addEventListener("click", () => {
      location.hash = "#pongMenu";
    });

    document.getElementById("matchHistory")?.addEventListener("click", () => {
      document.getElementById("matchHistoryModal")?.classList.remove("hidden");
    });

    renderMatchHistoryTable(stats.recentGames);

    document.getElementById("filterResult")?.addEventListener("change", (e) => {
      applyMatchHistoryFilters(stats);
    });
    document.getElementById("filterSort")?.addEventListener("change", (e) => {
      applyMatchHistoryFilters(stats);
    });

    document.getElementById("closeMatchHistory")?.addEventListener("click", () => {
      document.getElementById("matchHistoryModal")?.classList.add("hidden");
    });
    populateMatchHistoryTable(stats, myId);

  } catch (err) {
    navigateTo("pongMenu");
    content.innerHTML = `<p class="text-red-400">Failed to load dashboard</p>`;
  }
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function statsCards(stats: UserStats): string {
  return `
    <div class="grid grid-cols-2 gap-4">
      ${statCard(i18n.t("games"), stats.totalGames,)}
      ${statCard(i18n.t("wins"), stats.wins)}
      ${statCard(i18n.t("losses"), stats.losses)}
      ${statCard(i18n.t("avgScore"), stats.avgScore)}
      ${statCard(i18n.t("avgDuration"), formatDuration(stats.avgDuration))}
      ${statCard("🏆 Tournaments Won", stats.tournamentWins)}
    </div>
  `;
}

function statCard(label: string, value: number | string): string {
  return `
    <div class="bg-black bg-opacity-40 rounded-xl p-4">
      <p class="text-sm font-medium text-amber-100">${label}</p>
      <p class="text-3xl font-bold text-amber-200">${value}</p>
    </div>
  `;
}

function winRateWidget(stats: UserStats): string {
  const total = stats.wins + stats.losses;
  const winRate = total ? stats.wins / total : 0;

  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const winLength = winRate * circumference;
  const lossLength = circumference - winLength;

  return `
    <div class="bg-rose-950 bg-opacity-80 rounded-xl p-6 flex flex-col items-center justify-center gap-4">
      <h2 data-i18n="winRate" class="text-xl font-semibold text-amber-100"></h2>
      
        <svg width="200" height="200" viewBox="0 0 160 160">
          <circle
            cx="80"
            cy="80"
            r="${radius}"
            stroke="#3f1d1d"
            stroke-width="16"
            fill="none"
          />
          <circle
            cx="80"
            cy="80"
            r="${radius}"
            stroke="#22c55e"
            stroke-width="16"
            fill="none"
            stroke-dasharray="${winLength} ${lossLength}"
            transform="rotate(-90 80 80)"
            stroke-linecap="round"
          />
        </svg>

        <p class="text-amber-100 text-lg font-bold">
          ${Math.round(winRate * 100)}%
        </p>
    </div>
  `;
}

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} ${i18n.t("minutesAgo")}`;
  const h = Math.floor(min / 60);
  return `${h} ${i18n.t("hoursAgo")}`;
}


function recentGameWidget(stats: UserStats, myId: number): string {
  return `
    <div id="recentGamesCard" class="bg-black bg-opacity-40 rounded-xl px-4 py-2 mx-auto max-w-md relative">
      <div class="flex justify-between items-start mb-3">
        <h2 data-i18n="recentGames" class="text-lg font-semibold text-amber-100"></h2>
      </div>

      <div class="space-y-3 overflow-y-scroll max-h-20 pr-2">
        ${stats.recentGames.map(game => {
          return `
            <div class="flex flex-col bg-black bg-opacity-30 rounded-lg p-3">
              <div class="flex justify-between text-xs text-amber-200 mb-1">
                <span data-i18n="you" class="font-semibold"></span>
                <span data-i18n="opponent" class="font-semibold"></span>
              </div>

              <div class="flex justify-between items-center text-xl font-bold mb-1">
                <span class="${game.isWin ? 'text-green-400' : 'text-red-400'}">${game.myScore}</span>
                <span class="text-amber-100">–</span>
                <span class="text-amber-200">${game.oppScore}</span>
              </div>
              <p class="text-xs text-amber-300 text-right">${timeAgo(game.created_at)}</p>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function twoDigits(n: number): string {
  return n < 10 ? "0" + n : String(n);
}

function graphicWidget(stats: UserStats): string {
  const myId = Number(localStorage.getItem("userId"));
  const games = stats.recentGames;

  if (games.length === 0) {
    return `
      <div class="bg-black bg-opacity-40 rounded-xl p-4 w-96 flex flex-col">
        <h3 data-i18n="scoreTrend" class="text-amber-100 font-semibold mb-2"></h3>
        <p data-i18n="noRecentGames" class="text-amber-200 text-sm"></p>
      </div>
    `;
  }

  const width = 400; 
  const height = 220;
  const padding = 40;
  const maxScore = 11;
  const stepX =
    games.length > 1
      ? (width - 2 * padding) / (games.length - 1)
      : 0;

  const points = games.map((game, i) => {
    const score = game.myScore;
    const x = padding + i * stepX;
    const y = height - padding - (score / maxScore) * (height - 2 * padding);
    return `${x},${y}`;
  }).join(" ");

  const circles = games.map((game, i) => {
    const score = game.myScore;
    const x = padding + i * stepX;
    const y = height - padding - (score / maxScore) * (height - 2 * padding);
    return `<circle cx="${x}" cy="${y}" r="4" fill="#facc15"></circle>`;
  }).join("");

  const yLabels = Array.from({length: 12}, (_, i) => {
    const y = height - padding - (i / maxScore) * (height - 2 * padding);
    return `
      <line x1="${padding - 5}" y1="${y}" x2="${width - padding}" y2="${y}" stroke="#555" stroke-width="0.5"></line>
      <text x="${padding - 10}" y="${y + 4}" text-anchor="end" font-size="10" fill="#facc15">${i}</text>
    `;
  }).join("");

  const xLabels = games.map((game, i) => {
    const x = padding + i * stepX;
    const date = new Date(game.created_at);
    const label = `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
    return `<text x="${x}" y="${height - padding + 15}" text-anchor="middle" font-size="10" fill="#facc15">${label}</text>`;
  }).join("");

  const durationDiv = games.map((game) => {
    const date = new Date(game.created_at);
    const hhmm = `${String(date.getHours())}:${String(date.getMinutes())}`;
    const m = Math.floor(game.duration / 60);
    const s = game.duration % 60;
    const duration = `${m}m ${s}s`;
    return `<div class="text-center">${hhmm} : ${duration}</div>`;
  }).join("");

  return `
    <div class="bg-black bg-opacity-40 rounded-xl p-4 w-[500px] flex flex-col">
      <h3 data-i18n="scoreTrend" class="text-amber-100 font-semibold mb-2"></h3>
      <svg width="${width}" height="${height}">
        <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="#fff" stroke-width="1"></line>
        <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" stroke="#fff" stroke-width="1"></line>
        ${yLabels}
        ${xLabels}
        <polyline points="${points}" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round"></polyline>
        ${circles}
      </svg>
      <div class="mt-2 w-full text-amber-200 text-xs">
        <div data-i18n="timeDuration" class="text-center text-[10px] text-amber-300 font-semibold mb-1"></div>
        <div class="inline-grid w-full grid-cols-${games.length}">
          ${durationDiv}
        </div>
      </div>
    </div>
  `;
}

// --- MATCH HISTORY --- //

function populateMatchHistoryTable(stats: UserStats, myId: number) {
  const tbody = document.getElementById("matchHistoryTableBody");
  if (!tbody) return;

  tbody.innerHTML = stats.recentGames
    .map(game => {
      const opponent = game.opponent_name;
      return `
        <tr class="border-b border-amber-900/40">
          <td class="py-2">${new Date(game.created_at).toLocaleString()}</td>
          <td>${opponent}</td>
          <td class="text-center font-bold">${game.myScore} - ${game.oppScore}</td>
          <td class="text-center ${game.isWin ? "text-green-400" : "text-red-400"}">
            ${game.isWin ? "Win" : "Loss"}
          </td>
          <td class="text-center">${Math.floor(game.duration/60)}m ${game.duration%60}s</td>
        </tr>
      `;
    })
    .join("");
}

function renderMatchHistoryTable(games: RecentGame[]) {
  const tbody = document.getElementById("matchHistoryTableBody");
  if (!tbody) return;

  tbody.innerHTML = games.map(game => `
    <tr class="border-b border-amber-900/40">
      <td class="py-2">${new Date(game.created_at).toLocaleString()}</td>
      <td>${game.opponent_name}</td>
      <td class="text-center font-bold">${game.myScore} - ${game.oppScore}</td>
      <td class="text-center ${game.isWin ? "text-green-400" : "text-red-400"}">
        ${game.isWin ? "Win" : "Loss"}
      </td>
      <td class="text-center">
        ${Math.floor(game.duration / 60)}m ${game.duration % 60}s
      </td>
    </tr>
  `).join("");
}

function applyMatchHistoryFilters(stats: UserStats) {
  const resultFilter = (document.getElementById("filterResult") as HTMLSelectElement).value;
  const sortFilter = (document.getElementById("filterSort") as HTMLSelectElement).value;

  let games = [...stats.recentGames];

  if (resultFilter === "win") {
    games = games.filter(g => g.isWin);
  } else if (resultFilter === "loss") {
    games = games.filter(g => !g.isWin);
  }

  if (sortFilter === "dateDesc") {
    games.sort((a, b) => b.created_at - a.created_at);
  } else if (sortFilter === "dateAsc") {
    games.sort((a, b) => a.created_at - b.created_at);
  } else if (sortFilter === "duration") {
    games.sort((a, b) => b.duration - a.duration);
  }

  renderMatchHistoryTable(games);
}



