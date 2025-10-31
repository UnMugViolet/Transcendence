"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const form = document.getElementById("loginForm");
const aliasInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const welcome = document.getElementById("welcome");
form.addEventListener("submit", (e) => __awaiter(void 0, void 0, void 0, function* () {
    e.preventDefault();
    const username = aliasInput.value.trim();
    const password = passwordInput.value.trim();
    if (!username || !password) {
        welcome.textContent = "Please enter both username and password.";
        return;
    }
    try {
        const response = yield fetch("http://localhost:3000/users", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ name: username })
        });
        if (!response.ok) {
            throw new Error("Network response was not ok");
        }
        const user = yield response.json();
        console.log("User created:", user);
        sessionStorage.setItem("username", username);
        window.location.href = "game.html";
    }
    catch (error) {
        console.error("Error:", error);
        welcome.textContent = "Error connecting. Please try again.";
    }
}));
function fetchUsers() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield fetch("/api/users");
            if (!response.ok) {
                throw new Error("Network response was not ok");
            }
            const users = yield response.json();
            console.log("Users:", users);
        }
        catch (error) {
            console.error("Error fetching users:", error);
        }
    });
}
