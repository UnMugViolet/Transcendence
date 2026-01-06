export const BACKEND_URL = window.location.hostname === 'localhost'
    ? "http://localhost:3000"
    : window.location.protocol === 'https:'
        ? `${window.location.protocol}//${window.location.hostname}:8443/api`
        : `http://${window.location.hostname}:8080/api`;
