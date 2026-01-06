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

    content.innerHTML = `
      ${statsCards(stats)}
      ${winRateWidget(stats)}
    `;

    // bouton retour
    document.getElementById("dashboardBack")?.addEventListener("click", () => {
      location.hash = "#pongMenu";
    });

  } catch (err) {
    console.error(err);
    content.innerHTML = `<p class="text-red-400">Failed to load dashboard</p>`;
  }
}

function statsCards(stats: UserStats): string {
  return `
    <div class="grid grid-cols-2 gap-4">
      ${statCard("Games", stats.totalGames)}
      ${statCard("Wins", stats.wins)}
      ${statCard("Losses", stats.losses)}
      ${statCard("Avg Score", stats.avgScore)}
    </div>
  `;
}

function statCard(label: string, value: number | string): string {
  return `
    <div class="bg-black bg-opacity-40 rounded-xl p-4">
      <p class="text-sm text-amber-200">${label}</p>
      <p class="text-3xl font-bold text-amber-100">${value}</p>
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
    <div class="bg-rose-950 bg-opacity-80 rounded-xl p-6 flex flex-col items-center gap-4">
      <h2 class="text-xl font-semibold text-amber-100">Win Rate</h2>

      <svg width="160" height="160" viewBox="0 0 160 160">
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

      <div class="flex gap-4 text-sm">
        <span class="text-green-400">● Wins: ${stats.wins}</span>
        <span class="text-red-400">● Losses: ${stats.losses}</span>
      </div>
    </div>
  `;
}


