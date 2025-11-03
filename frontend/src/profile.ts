import { BACKEND_URL } from "./config.js";
import { i18n } from "./i18n.js";


// User profile modal elements
const profileModal = document.getElementById("modalProfile");
const closeProfileBtn = document.getElementById("closeProfile");
const formProfile = document.getElementById("formProfile") as HTMLFormElement | null;
const profilePicturePreview = document.getElementById("profilePicturePreview") as HTMLImageElement | null;
const editProfilePictureBtn = document.getElementById("editProfilePictureBtn");
const profilePictureInput = document.getElementById("profilePictureInput") as HTMLInputElement | null;
const userAvatar = document.getElementById("userAvatar") as HTMLImageElement | null;
const messageEl = document.getElementById("profileMessage") as HTMLParagraphElement;

// Friend profile modal elements
const friendProfileModal = document.getElementById("modalFriendProfile");
const closeFriendProfileBtn = document.getElementById("closeFriendProfile");
const friendProfileAvatar = document.getElementById("friendProfileAvatar") as HTMLImageElement;
const friendProfileName = document.getElementById("friendProfileName");
const friendProfileStatus = document.getElementById("friendProfileStatus");
const friendProfileBio = document.getElementById("friendProfileBio");
const friendAddBtn = document.getElementById("friendAddBtn");
const friendInviteBtn = document.getElementById("friendInviteBtn");

editProfilePictureBtn?.addEventListener("click", () => {
  profilePictureInput?.click();
});

document.getElementById("userAvatar")?.addEventListener("click", () => {
	if (profileModal) profileModal.classList.remove("hidden");
	// Affiche l'avatar dans le modal
	const modalAvatar = document.getElementById("profilePicturePreview") as HTMLImageElement | null;
	const avatarSrc = userAvatar?.src;
	if (modalAvatar && avatarSrc) {
		modalAvatar.src = avatarSrc;
	}
	if (messageEl) {
		messageEl.textContent = "";
		messageEl.style.color = "";
	}
});

// Met à jour l'aperçu de l'image dans le modal dès qu'un nouveau fichier est sélectionné
profilePictureInput?.addEventListener("change", () => {
	const file = profilePictureInput.files?.[0];
	if (file && profilePicturePreview) {
		const reader = new FileReader();
		reader.onload = (e) => {
			profilePicturePreview.src = e.target?.result as string;
		};
		reader.readAsDataURL(file);
	}
});

closeProfileBtn?.addEventListener("click", () => {
  if (profileModal) profileModal.classList.add("hidden");
});

formProfile?.addEventListener("submit", async (e) => {
	e.preventDefault();
	const token = sessionStorage.getItem("token");
	if (!token) return;

	const name = (document.getElementById("profileNameInput") as HTMLInputElement).value;
	const password = (document.getElementById("profilePasswordInput") as HTMLInputElement).value;
	const passwordConfirm = (document.getElementById("profilePasswordConfirm") as HTMLInputElement).value;
	const pictureInput = document.getElementById("profilePictureInput") as HTMLInputElement;

	try {
		if (name) {
			const res = await fetch(`${BACKEND_URL}/update/name`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Authorization": `Bearer ${token}`,
				},
				body: JSON.stringify({ name }),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || i18n.t("errorName"));
			const welcomeMessage = document.getElementById("welcomeMessage");
			if (welcomeMessage) welcomeMessage.textContent = name;
			sessionStorage.setItem("username", name);
		}

		if (password) {
			if (password !== passwordConfirm) {
				throw new Error(i18n.t("passwordMismatch"));
			}
			const res = await fetch(`${BACKEND_URL}/update/password`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Authorization": `Bearer ${token}`,
				},
				body: JSON.stringify({ pass: password }),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || i18n.t("errorPassword"));
		}

		if (pictureInput && pictureInput.files && pictureInput.files[0]) {
			const formData = new FormData();
			formData.append("file", pictureInput.files[0]);

			const res = await fetch(`${BACKEND_URL}/update/profile_picture`, {
				method: "POST",
				headers: {
					"Authorization": `Bearer ${token}`,
				},
				body: formData,
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || i18n.t("errorPp"));
			if (userAvatar) userAvatar.src = `${BACKEND_URL}/uploads/${data.filename}`;
			sessionStorage.setItem("profilePicture", data.filename);
		}

		if (messageEl) {
			messageEl.textContent = i18n.t("profileSuccess");
			messageEl.style.color = "green";
			profileModal?.classList.add("hidden");
		}
	} catch (err) {
		if (messageEl) {
			messageEl.textContent = (err as Error).message;
			messageEl.style.color = "red";
		}
		console.error("Error updating profile:", err);
	}
});

closeFriendProfileBtn?.addEventListener("click", () => {
  if (friendProfileModal) friendProfileModal.classList.add("hidden");
});

export async function openFriendProfile(friendId: number) {
	try {
		const token = sessionStorage.getItem("token");
		if (!token) return;

		const res = await fetch(`${BACKEND_URL}/users/${friendId}`, {
			headers: { "Authorization": `Bearer ${token}` }
		});
		const data = await res.json();
		if (!res.ok) throw new Error(data.error || i18n.t("errorProfile"));

		if (friendProfileAvatar) friendProfileAvatar.src = data.profile_picture ? `${BACKEND_URL}/uploads/${data.profile_picture}` : "/default_avatar.png";
		if (friendProfileName) friendProfileName.textContent = data.name || i18n.t("unknownUser");
		if (friendProfileStatus) friendProfileStatus.textContent = data.is_online ? i18n.t("online1") : i18n.t("offline");

		//TODO : ajouter le bouton pour bloquer/débloquer l'ami
		
		friendProfileModal?.classList.remove("hidden");
	} catch (err) {
		console.error("Error loading friend profile:", err);
	}
}