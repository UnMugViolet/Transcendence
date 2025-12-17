// import { ApiClient } from "../utils/api.js";
// import { BACKEND_URL } from "../utils/config.js";
// import type { ApiResponse, UserStats } from "../types/types.js";
// import { Router } from "../route/router.js";

// export async function getUserStats(): Promise<UserStats> {
//   const res = await ApiClient.get(`${BACKEND_URL}/stats/me`);

//   const json: ApiResponse<UserStats> = await res.json();

//   if (!res.ok || !json.data) {
//     throw new Error(json.error || "Failed to load user stats");
//   }

//   return json.data;
// }

// /**
//  * Génère le HTML d'une card statistique
//  */
// function statCard(label: string, value: number | string): string {
//   return `
//     <div class="bg-black bg-opacity-40 rounded-xl p-4">
//       <p class="text-sm text-amber-200">${label}</p>
//       <p class="text-3xl font-bold text-amber-100">${value}</p>
//     </div>
//   `;
// }

// /**
//  * Génère une barre de progression
//  */
// function progressBar(value: number): string {
//   return `
//     <div class="w-full bg-black bg-opacity-30 rounded-full h-3">
//       <div
//         class="bg-green-500 h-3 rounded-full transition-all"
//         style="width: ${value}%"
//       ></div>
//     </div>
//   `;
// }

// /**
//  * Génère le HTML complet du dashboard
//  */
// function renderUserDashboard(stats: UserStats): string {
//   return `
//     <h1 class="text-2xl font-bold text-amber-100 mb-6">Your Dashboard</h1>

//     <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
//       ${statCard("Games", stats.totalGames)}
//       ${statCard("Wins", stats.wins)}
//       ${statCard("Losses", stats.losses)}
//       ${statCard("Avg Score", stats.avgScore)}
//     </div>

//     <div class="bg-rose-950 bg-opacity-80 p-4 rounded-xl mb-6">
//       <p class="text-sm text-amber-200 mb-2">Win Rate — ${stats.winRate}%</p>
//       ${progressBar(stats.winRate)}
//     </div>

//     <button id="backToMenu" class="mt-6 bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600">
//       Back to Menu
//     </button>
//   `;
// }

// /**
//  * Charge et affiche le dashboard dans le DOM
//  */
// export async function loadUserDashboard() {
//   const container = document.getElementById("userDashboard");
//   if (!container) return;

//   Router.showView("userDashboard");
//   container.innerHTML = `<p class="text-amber-200">Loading dashboard...</p>`;

//   try {
//     const stats = await getUserStats();
//     container.innerHTML = renderUserDashboard(stats);

//     // Bouton retour
//     const backBtn = document.getElementById("backToMenu");
//     backBtn?.addEventListener("click", () => {
//       location.hash = "#pongMenu";
//     });

//   } catch (err) {
//     console.error(err);
//     container.innerHTML = `<p class="text-red-400">Failed to load dashboard</p>`;
//   }
// }
