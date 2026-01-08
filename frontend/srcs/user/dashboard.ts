import { ApiClient } from "../utils/api.js";
import { BACKEND_URL } from "../utils/config.js";
import type { ApiResponse, UserStats } from "../types/types.js";
import { Router } from "../route/router.js";

export async function getUserStats(): Promise<UserStats> {
  const res = await ApiClient.get(`${BACKEND_URL}/stats/me`);

  const json: ApiResponse<UserStats> = await res.json();

  if (!res.ok || !json.data) {
    throw new Error(json.error || "Failed to load user stats");
  }

  return json.data;
}

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

    document.getElementById("dashboardBack")?.addEventListener("click", () => {
      location.hash = "#pongMenu";
    });

  } catch (err) {
    console.error(err);
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
      ${statCard("Games", stats.totalGames,)}
      ${statCard("Wins", stats.wins)}
      ${statCard("Losses", stats.losses)}
      ${statCard("Avg Score", stats.avgScore)}
      ${statCard("Avg Duration", formatDuration(stats.avgDuration))}
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
      <h2 class="text-xl font-semibold text-amber-100">Win Rate</h2>
      
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
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  return `${h}h ago`;
}


function recentGameWidget(stats: UserStats, myId: number): string {
  return `
    <div id="recentGamesCard" class="bg-black bg-opacity-40 rounded-xl p-4 mx-auto max-w-md relative">
      <div class="flex justify-between items-start mb-3">
        <h2 class="text-lg font-semibold text-amber-100">Recent Games</h2>
      </div>

      <div class="space-y-3 overflow-y-scroll max-h-20 pr-2">
        ${stats.recentGames.map(game => {
          const isP1 = game.p1_id === myId;
          const myScore = isP1 ? game.p1_score : game.p2_score;
          const oppScore = isP1 ? game.p2_score : game.p1_score;
          const isWin = myScore > oppScore;

          return `
            <div class="flex flex-col bg-black bg-opacity-30 rounded-lg p-3">
              <div class="flex justify-between text-xs text-amber-200 mb-1">
                <span class="font-semibold">YOU</span>
                <span class="font-semibold">OPPONENT</span>
              </div>
              <div class="flex justify-between items-center text-xl font-bold mb-1">
                <span class="${isWin ? 'text-green-400' : 'text-red-400'}">${myScore}</span>
                <span class="text-amber-100">–</span>
                <span class="text-amber-200">${oppScore}</span>
              </div>
              <p class="text-xs text-amber-300 text-right">${timeAgo(game.created_at)}</p>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function graphicWidget(stats: UserStats): string {
  const myId = Number(localStorage.getItem("userId"));
  const games = stats.recentGames;

  if (games.length === 0) {
    return `
      <div class="bg-black bg-opacity-40 rounded-xl p-4 w-96 flex flex-col">
        <h3 class="text-amber-100 font-semibold mb-2">Score Trend</h3>
        <p class="text-amber-200 text-sm">No recent games</p>
      </div>
    `;
  }

  const width = 400; 
  const height = 220;
  const padding = 40;
  const maxScore = 11;
  const stepX = (width - 2 * padding) / (games.length - 1);

  // Préparer les points de la ligne
  const points = games.map((game, i) => {
    const score = game.p1_id === myId ? game.p1_score : game.p2_score;
    const x = padding + i * stepX;
    const y = height - padding - (score / maxScore) * (height - 2 * padding);
    return `${x},${y}`;
  }).join(" ");

  // Cercles pour les points
  const circles = games.map((game, i) => {
    const score = game.p1_id === myId ? game.p1_score : game.p2_score;
    const x = padding + i * stepX;
    const y = height - padding - (score / maxScore) * (height - 2 * padding);
    return `<circle cx="${x}" cy="${y}" r="4" fill="#facc15"></circle>`;
  }).join("");

  // Labels verticaux (0 à 11)
  const yLabels = Array.from({length: 12}, (_, i) => {
    const y = height - padding - (i / maxScore) * (height - 2 * padding);
    return `
      <line x1="${padding - 5}" y1="${y}" x2="${width - padding}" y2="${y}" stroke="#555" stroke-width="0.5"></line>
      <text x="${padding - 10}" y="${y + 4}" text-anchor="end" font-size="10" fill="#facc15">${i}</text>
    `;
  }).join("");

  // Labels horizontaux (dates/heure)
  const xLabels = games.map((game, i) => {
    const x = padding + i * stepX;
    const date = new Date(game.created_at);
    const label = `${date.getHours()}:${String(date.getMinutes()).padStart(2,'0')}`;
    return `<text x="${x}" y="${height - padding + 15}" text-anchor="middle" font-size="10" fill="#facc15">${label}</text>`;
  }).join("");

  // Durée et heure des parties
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
      <h3 class="text-amber-100 font-semibold mb-2">Score Trend</h3>
      <svg width="${width}" height="${height}">
        <!-- Axes -->
        <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="#fff" stroke-width="1"></line>
        <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" stroke="#fff" stroke-width="1"></line>

        <!-- Grille et labels -->
        ${yLabels}
        ${xLabels}

        <!-- Ligne des scores -->
        <polyline points="${points}" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round"></polyline>
        <!-- Cercles sur les points -->
        ${circles}
      </svg>

      <!-- Heure / Durée -->
      <div class="mt-2 w-full text-amber-200 text-xs">
        
        <!-- En-tête UNIQUE -->
        <div class="text-center text-[10px] text-amber-300 font-semibold mb-1">
          Time : Duration
        </div>

        <!-- Colonnes alignées -->
        <div class="inline-grid w-full grid-cols-${games.length}">
          ${durationDiv}
        </div>

      </div>
    </div>
  `;
}






