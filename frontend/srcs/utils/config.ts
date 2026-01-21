export const BACKEND_URL = (() => {
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;

  if (hostname === 'localhost') {
    if (protocol === 'http:') {
      return 'http://localhost:3000';
    }
  }
  return '/api';
})();

// export const BACKEND_URL = '/api';

