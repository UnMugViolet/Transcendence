"use strict";
const username = sessionStorage.getItem("username");
if (!username) {
    // Pas connecté → retour login
    window.location.href = "index.html";
}
else {
    const app = document.getElementById("app");
    app.textContent = `Hello world, ${username} !`;
}
