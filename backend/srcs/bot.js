import db from '../db.js';
import { clients } from './chat.js';
import WebSocket from 'ws';
import { posYPlayer1, posYPlayer2, player1Score, player2Score, ballX, ballY, gameId } from '../../frontend/src/game.js';

const botToken = fastify.jwt.sign({ id: -1, name : 'Botty', type : 'access' });
const botSocket = new WebSocket(`ws://localhost:3000/ws?token=${botToken}`);

const bot = new Map();

function createGame() {
	return {
		P1X : 0,
		P1Y : 0,
		P2X : 0,
		P2Y : 0,
		BallX : 0,
		BallY : 0,
		P1Score : 0,
		P2Score : 0,
	};
}

export const botLoop = setInterval(() => {
	if (gameId > -1 && !bot.has(gameId))
		bot.set(gameId, createGame());
	bot.forEach((value, key) => {
		value.P1Y = posYPlayer1;
		value.P2Y = posYPlayer2;
		value.BallX = ballX;
		value.BallY = ballY;
		value.P1Score = player1Score;
		value.P2Score = player2Score;
	});
	try {

	} catch (err) {
		console.error('Error in bot loop:', err);
	}
}, 1000);