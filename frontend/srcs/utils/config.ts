// export const BACKEND_URL = (() => {
//     const { hostname, protocol } = window.location;
//     if (hostname === 'localhost')
//         return 'http://localhost:3000';
//     if (protocol === 'https:')
//         return `${protocol}//${hostname}:8443/api`;
//     return `http://${hostname}:8080/api`;
// })();

// export const BACKEND_URL = '/api';

export const BACKEND_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : '/api';

