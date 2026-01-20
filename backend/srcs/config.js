const isProduction = process.env.NODE_ENV === 'production';
export const BACKEND_URL = isProduction ? 'https://localhost:3443' : 'http://localhost:3000';
