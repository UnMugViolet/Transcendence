import db from '../db.js';
import { partyPlayerQueries } from './database-queries.js'

export function getUserStats(userId) {
  const stmt = db.prepare(`
    SELECT
      p1_id, p2_id,
      p1_score, p2_score,
      winner_id,
      created_at,
      duration
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

  const duration = matches.map(m => m.duration).filter(Boolean);
  const avgDuration = duration.length
    ? Math.round(duration.reduce((a, b) => a + b, 0) / duration.length)
    : 0;

  return {
    totalGames,
    wins,
    losses,
    winRate: totalGames ? Math.round((wins / totalGames) * 100) : 0,
    avgScore,
    scoreHistory: scores.slice(-10),
    recentGames: matches.slice(-5).reverse(),
    avgDuration
  };
}

export function saveMatchToHistory(partyId, game) {
  const players = partyPlayerQueries.findByPartyId(partyId);

  if (players.length < 2) {
    console.warn('❌ Not enough players to save match', players);
    return;
  }

  const p1 = players.find(p => p.team === game.team1);
  const p2 = players.find(p => p.team === game.team2);

  if (!p1 || !p2) {
    console.warn('❌ Players not found for the given teams', game);
    return;
  }

  const p1Score = game.score1 ?? 0;
  const p2Score = game.score2 ?? 0;

  if (p1Score === 0 && p2Score === 0) {
    console.warn('⚠️ Match ended with no score, skipping save');
    return;
  }

  const winnerId =
    p1Score > p2Score ? p1.user_id :
    p2Score > p1Score ? p2.user_id :
    null;
  
  const duration = game.created
    ? Math.floor((Date.now() - game.created) / 1000)
    : null;

  db.prepare(`
    INSERT INTO match_history (
      p1_id,
      p2_id,
      p1_score,
      p2_score,
      winner_id,
      created_at,
      duration
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    p1.user_id,
    p2.user_id,
    p1Score,
    p2Score,
    winnerId,
    game.created,
    duration
  );

  console.log('✅ Match saved to history', {
    p1: p1.user_id,
    p2: p2.user_id,
    score: `${p1Score}-${p2Score}`
  });
}



