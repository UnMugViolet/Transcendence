import { BACKEND_URL } from "../utils/config.js";
import { i18n } from "../utils/i18n.js";
import { AuthManager } from "./auth.js";


// User profile modal elements
const profileModal: HTMLElement | null = document.getElementById("modalProfile");
const closeProfileBtn: HTMLElement | null = document.getElementById("closeProfile");
const formProfile: HTMLFormElement | null = document.getElementById("formProfile") as HTMLFormElement;
const profilePicturePreview: HTMLImageElement | null = document.getElementById("profilePicturePreview") as HTMLImageElement;
const editProfilePictureBtn: HTMLElement | null = document.getElementById("editProfilePictureBtn");
const profilePictureInput: HTMLInputElement | null = document.getElementById("profilePictureInput") as HTMLInputElement;
const userName: HTMLElement | null = document.getElementById("userName");
const userAvatar: HTMLImageElement | null = document.getElementById("userAvatar") as HTMLImageElement;
const messageEl: HTMLParagraphElement | null = document.getElementById("alert") as HTMLParagraphElement;

// Friend profile modal elements
const friendProfileModal: HTMLElement | null = document.getElementById("modalFriendProfile");
const closeFriendProfileBtn: HTMLElement | null = document.getElementById("closeFriendProfile");
const friendProfileAvatar: HTMLImageElement | null = document.getElementById("friendProfileAvatar") as HTMLImageElement;
const friendProfileName: HTMLElement | null = document.getElementById("friendProfileName");
const friendProfileStatus: HTMLElement | null = document.getElementById("friendProfileStatus");
const friendProfileBio: HTMLElement | null = document.getElementById("friendProfileBio");
const friendAddBtn: HTMLElement | null = document.getElementById("friendAddBtn");
const friendInviteBtn: HTMLElement | null = document.getElementById("friendInviteBtn");


editProfilePictureBtn?.addEventListener("click", () => {
  profilePictureInput?.click();
});

/**
 * Fills the profile name input with the current username
 */
function fillProfileNameInput(): void {
	if (!userName) {
		return;
	}
	
	const profileNameInput = document.getElementById("profileNameInput") as HTMLInputElement | null;
	if (profileNameInput && userName.textContent) {
		profileNameInput.value = userName.textContent;
	}
}

/**
 * Updates profile modal UI with current user data and avatar
 */
function updateProfileModalUI(): void {
	// Show avatar in modal
	if (profilePicturePreview && userAvatar) {
		profilePicturePreview.src = userAvatar.src;
	}

	// Clear previous messages
	if (messageEl) {
		messageEl.textContent = "";
		messageEl.style.color = "";
	}

	fillProfileNameInput();
}

document.getElementById("userInfo")?.addEventListener("click", () => {
	if (profileModal) {
		profileModal.classList.remove("hidden");
		profileModal.classList.add("flex");
	}
	updateProfileModalUI();
});

// Update profile picture preview on file selection
profilePictureInput?.addEventListener("change", () => {
	const file: File | undefined = profilePictureInput.files?.[0];

	if (file && profilePicturePreview) {
		const reader = new FileReader();
		reader.onload = (e) => {
			profilePicturePreview.src = e.target?.result as string;
		};
		reader.readAsDataURL(file);
	}
});

closeProfileBtn?.addEventListener("click", () => {
  if (profileModal) {
	profileModal.classList.add("hidden");
  }
});

formProfile?.addEventListener("submit", async (e) => {
	e.preventDefault();
	const token = AuthManager.getToken();
	if (!token) {
		return;
	}

	const name = (document.getElementById("profileNameInput") as HTMLInputElement).value;
	const password = (document.getElementById("profilePasswordInput") as HTMLInputElement).value;
	const passwordConfirm = (document.getElementById("profilePasswordConfirm") as HTMLInputElement).value;
	const pictureInput: HTMLInputElement | null = document.getElementById("profilePictureInput") as HTMLInputElement;
	const isDemoUser = AuthManager.isDemoUser();

	try {
		console.log("isDemoUser:", isDemoUser);
		if (isDemoUser) {
			throw new Error(i18n.t("demoUserEditError"));
		}

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
			if (!res.ok) {
				throw new Error(data.error || i18n.t("errorName"));
			}
			if (userName) {
				userName.textContent = name;
			}
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
				body: JSON.stringify({ password: password }),
			});
			const data = await res.json();
			console.log("Password update response:", data);
			if (!res.ok) {
				throw new Error(data.error || i18n.t("errorPassword"));
			}
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
			if (!res.ok) {
				throw new Error(data.error || i18n.t("errorPp"));
			}
			if (userAvatar) {
				userAvatar.src = `${BACKEND_URL}/img/${data.filename}`;
			}
			sessionStorage.setItem("profilePicture", data.filename);
		}

		if (messageEl) {
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
		if (!token) {
			 return;
		}

		const res = await fetch(`${BACKEND_URL}/users/${friendId}`, {
			headers: { "Authorization": `Bearer ${token}` }
		});
		const data = await res.json();
		if (!res.ok) throw new Error(data.error || i18n.t("errorProfile"));

		if (friendProfileAvatar) friendProfileAvatar.src = data.profile_picture ? `${BACKEND_URL}/img/${data.profile_picture}` : "/default_avatar.png";
		if (friendProfileName) friendProfileName.textContent = data.name || i18n.t("unknownUser");
		if (friendProfileStatus) friendProfileStatus.textContent = data.is_online ? i18n.t("online1") : i18n.t("offline");

		//TODO : ajouter le bouton pour bloquer/débloquer l'ami
		
		friendProfileModal?.classList.remove("hidden");
	} catch (err) {
		console.error("Error loading friend profile:", err);
	}
}
