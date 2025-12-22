import prometheus from 'prom-client';

// Initialize default metrics
prometheus.collectDefaultMetrics({ prefix: 'nodejs_' });

// ===== HTTP Metrics =====
const httpRequestDuration = new prometheus.Histogram({
  name: 'fastify_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.001, 0.01, 0.05, 0.1, 0.5, 1, 2, 5]
});

const httpRequestsTotal = new prometheus.Counter({
  name: 'fastify_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status']
});

// ===== WebSocket Metrics =====
const websocketConnectionsActive = new prometheus.Gauge({
  name: 'fastify_websocket_connections_active',
  help: 'Active WebSocket connections'
});

const websocketErrorsTotal = new prometheus.Counter({
  name: 'fastify_websocket_errors_total',
  help: 'Total WebSocket errors',
  labelNames: ['error_type']
});

// ===== Authentication Metrics =====
const authFailuresTotal = new prometheus.Counter({
  name: 'fastify_auth_failures_total',
  help: 'Total authentication failures',
  labelNames: ['reason']
});

// ===== Game Metrics =====
const gameActiveGames = new prometheus.Gauge({
  name: 'fastify_game_active_games',
  help: 'Number of active games'
});

const gameLoopIterations = new prometheus.Counter({
  name: 'fastify_game_loop_iterations_total',
  help: 'Total game loop iterations'
});

// ===== Database Metrics =====
const sqliteQueryDuration = new prometheus.Histogram({
  name: 'sqlite_query_duration_seconds',
  help: 'Duration of SQLite queries in seconds',
  labelNames: ['query_type'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1]
});

const sqliteDatabaseLocks = new prometheus.Gauge({
  name: 'sqlite_database_locks',
  help: 'Number of database locks'
});

const sqliteDatabaseSizeBytes = new prometheus.Gauge({
  name: 'sqlite_database_size_bytes',
  help: 'SQLite database file size in bytes'
});

// ===== User Metrics =====
const totalUsers = new prometheus.Gauge({
  name: 'fastify_users_total',
  help: 'Total number of registered users'
});

const demoUsers = new prometheus.Gauge({
  name: 'fastify_demo_users',
  help: 'Number of demo user accounts'
});

export const metrics = {
  // HTTP tracking
  recordHttpRequest(method, route, status, duration) {
    // Ensure duration is valid
    if (typeof duration === 'number' && !Number.isNaN(duration) && duration >= 0) {
      httpRequestDuration.labels(method, route, status).observe(duration);
    }
    httpRequestsTotal.labels(method, route, status).inc();
  },

  // Authentication tracking
  recordAuthFailure(reason) {
    authFailuresTotal.inc({ reason });
  },

  // WebSocket tracking
  recordWebSocketConnection() {
    websocketConnectionsActive.inc();
  },

  recordWebSocketDisconnection() {
    websocketConnectionsActive.dec();
  },

  recordWebSocketError(errorType) {
    websocketErrorsTotal.inc({ error_type: errorType });
  },

  getActiveWebSocketConnections() {
    return websocketConnectionsActive.get();
  },

  // Game tracking
  setActiveGames(count) {
    gameActiveGames.set(count);
  },

  recordGameLoopIteration() {
    gameLoopIterations.inc();
  },

  // Database tracking
  recordQueryDuration(queryType, duration) {
    sqliteQueryDuration.labels(queryType).observe(duration);
  },

  setDatabaseLocks(count) {
    sqliteDatabaseLocks.set(count);
  },

  setDatabaseSize(sizeBytes) {
    sqliteDatabaseSizeBytes.set(sizeBytes);
  },

  // User tracking
  setTotalUsers(count) {
    totalUsers.set(count);
  },

  setDemoUsers(count) {
    demoUsers.set(count);
  },

  // Get all metrics
  getMetrics() {
    return prometheus.register.metrics();
  },

  getContentType() {
    return prometheus.register.contentType;
  }
};

export default metrics;
