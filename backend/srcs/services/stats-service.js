import db from '../db.js';

export function getUserStats(userId) {
  const stmt = db.prepare(`
    SELECT
      p1_id, p2_id,
      p1_score, p2_score,
      winner_id,
      created_at
    FROM match_history
    WHERE p1_id = ? OR p2_id = ?
    ORDER BY created_at ASC
  `);

  const matches = stmt.all(userId, userId);

  const totalGames = matches.length;
  const wins = matches.filter(m => m.winner_id === userId).length;
  const losses = totalGames - wins;

  const scores = matches.map(m =>
    m.p1_id === userId ? m.p1_score : m.p2_score
  );

  const avgScore = scores.length
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0;

  return {
    totalGames,
    wins,
    losses,
    winRate: totalGames ? Math.round((wins / totalGames) * 100) : 0,
    avgScore,
    scoreHistory: scores.slice(-10),   // pour bar chart
    recentGames: matches.slice(-5).reverse()
  };
}
