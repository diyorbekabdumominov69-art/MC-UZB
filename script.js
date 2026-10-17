
import { firebaseConfig } from "./firebase-config.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  doc,
  updateDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  arrayUnion
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const ADMIN_EMAIL = "diyorbekabdumominov69@gmail.com";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

let currentUser = null;
let communities = [];
let selectedCommunityId = "";
let stopCommunities = null;
let stopMessages = null;

const $ = (id) => document.getElementById(id);

function show(id, visible) {
  const el = $(id);
  if (el) el.hidden = !visible;
}

function status(id, message) {
  const el = $(id);
  if (el) el.textContent = message;
}

function admin() {
  return currentUser?.email?.toLowerCase() === ADMIN_EMAIL;
}

function errorMessage(error) {
  console.error(error);

  if (error.code === "permission-denied") {
    return "Ruxsat berilmadi. Firestore Security Rules sozlamalarini tekshiring.";
  }

  if (error.code === "auth/unauthorized-domain") {
    return "Firebase Authentication ichida sayt domenini ruxsat etilganlar ro‘yxatiga qo‘shing.";
  }

  if (error.code === "auth/popup-closed-by-user") {
    return "Google orqali kirish oynasi yopildi.";
  }

  return error.message || "Xatolik yuz berdi.";
}

/* Google login */

$("loginBtn")?.addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    alert(errorMessage(error));
  }
});

/* Logout */

$("logoutBtn")?.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    alert(errorMessage(error));
  }
});

/* Login holatini tekshirish */

onAuthStateChanged(auth, (user) => {
  currentUser = user;

  if (stopCommunities) stopCommunities();
  if (stopMessages) stopMessages();

  stopCommunities = null;
  stopMessages = null;
  communities = [];
  selectedCommunityId = "";

  show("loginBtn", !user);
  show("logoutBtn", !!user);
  show("adminMenu", admin());
  show("admin", admin());

  status(
    "userLabel",
    user
      ? `${user.displayName || "Foydalanuvchi"}${admin() ? " · ADMIN" : ""}`
      : "Mehmon"
  );

  renderCommunities();
  renderCommunityOptions();

  if (user) {
    listenCommunities();
  } else {
    renderMessages([]);
    status("chatStatus", "Chat uchun Google orqali kiring.");
  }
});

/* Communitylarni olish */

function listenCommunities() {
  const ref = collection(db, "communities");

  const q = admin()
    ? ref
    : query(
        ref,
        where("memberEmails", "array-contains", currentUser.email)
      );

  stopCommunities = onSnapshot(
    q,
    (snapshot) => {
      communities = snapshot.docs.map((item) => ({
        id: item.id,
        ...item.data()
      }));

      communities.sort((a, b) =>
        (a.name || "").localeCompare(b.name || "")
      );

      if (
        !communities.some((c) => c.id === selectedCommunityId)
      ) {
        selectedCommunityId = communities[0]?.id || "";
      }

      renderCommunities();
      renderCommunityOptions();
      renderAdminOptions();
      listenMessages();
    },
    (error) => {
      status("chatStatus", errorMessage(error));
      status("adminStatus", errorMessage(error));
    }
  );
}

/* Community kartalari */

function renderCommunities() {
  const list = $("communityList");
  if (!list) return;

  list.replaceChildren();

  if (!currentUser) {
    list.textContent = "Communitylarni ko‘rish uchun Google orqali kiring.";
    return;
  }

  if (communities.length === 0) {
    list.textContent = "Hozircha community yo‘q yoki siz a'zo emassiz.";
    return;
  }

  for (const community of communities) {
    const card = document.createElement("div");
    card.className = "community-item";

    const info = document.createElement("div");
    const name = document.createElement("strong");
    const count = document.createElement("small");
    const button = document.createElement("button");

    name.textContent = community.name || "Community";
    count.textContent =
      `${community.memberEmails?.length || 0} ta a'zo`;

    button.className = "btn btn-small";
    button.type = "button";
    button.textContent =
      community.id === selectedCommunityId ? "Tanlangan" : "Ochish";

    button.addEventListener("click", () => {
      selectedCommunityId = community.id;
      renderCommunities();
      renderCommunityOptions();
      listenMessages();
    });

    info.append(name, count);
    card.append(info, button);
    list.append(card);
  }
}

/* Chat community tanlash */

function renderCommunityOptions() {
  const select = $("chatCommunity");
  if (!select) return;

  select.replaceChildren();

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Community tanlang";
  select.append(placeholder);

  for (const community of communities) {
    const option = document.createElement("option");
    option.value = community.id;
    option.textContent = community.name || "Community";
    select.append(option);
  }

  select.value = selectedCommunityId;
}

$("chatCommunity")?.addEventListener("change", (event) => {
  selectedCommunityId = event.target.value;
  renderCommunities();
  listenMessages();
});

/* Xabarlarni ko‘rsatish */

function renderMessages(messages) {
  const box = $("chatMessages");
  if (!box) return;

  box.replaceChildren();

  if (!currentUser) {
    box.textContent = "Chat uchun Google orqali kiring.";
    return;
  }

  if (!selectedCommunityId) {
    box.textContent = "Avval community tanlang.";
    return;
  }

  if (!messages.length) {
    box.textContent = "Hozircha xabar yo‘q.";
    return;
  }

  for (const message of messages) {
    const bubble = document.createElement("div");
    bubble.className = "chat-message";

    if (message.uid === currentUser.uid) {
      bubble.classList.add("mine");
    }

    const author = document.createElement("strong");
    author.textContent = message.displayName || message.email || "Foydalanuvchi";

    const body = document.createElement("p");
    body.textContent = message.text || "";

    const time = document.createElement("time");
    time.textContent = message.createdAt?.toDate
      ? message.createdAt.toDate().toLocaleString()
      : "Yangi xabar";

    bubble.append(author, body, time);
    box.append(bubble);
  }

  box.scrollTop = box.scrollHeight;
}

/* Jonli xabarlarni kuzatish */

function listenMessages() {
  if (stopMessages) stopMessages();
  stopMessages = null;

  renderMessages([]);

  if (!currentUser || !selectedCommunityId) {
    status("chatStatus", "Google orqali kiring va community tanlang.");
    return;
  }

  const community = communities.find(
    (item) => item.id === selectedCommunityId
  );

  if (!community) return;

  status("chatStatus", `Chat: ${community.name}`);

  const ref = collection(
    db,
    "communities",
    selectedCommunityId,
    "messages"
  );

  const q = query(ref, orderBy("createdAt", "asc"));

  stopMessages = onSnapshot(
    q,
    (snapshot) => {
      renderMessages(
        snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data()
        }))
      );
    },
    (error) => status("chatStatus", errorMessage(error))
  );
}

/* Chatga xabar yuborish */

$("chatForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!currentUser || !selectedCommunityId) {
    status("chatStatus", "Google orqali kiring va community tanlang.");
    return;
  }

  const input = $("chatInput");
  const text = input?.value?.trim();

  if (!text) return;

  if (text.length > 1000) {
    status("chatStatus", "Xabar 1000 belgidan oshmasin.");
    return;
  }

  const community = communities.find(
    (item) => item.id === selectedCommunityId
  );

  if (!community) {
    status("chatStatus", "Siz bu community a'zosi emassiz.");
    return;
  }

  const button = $("chatForm")?.querySelector('button[type="submit"]');
  if (button) button.disabled = true;

  try {
    await addDoc(
      collection(db, "communities", selectedCommunityId, "messages"),
      {
        text,
        uid: currentUser.uid,
        email: currentUser.email,
        displayName: currentUser.displayName || "Foydalanuvchi",
        createdAt: serverTimestamp()
      }
    );

    input.value = "";
    status("chatStatus", "Xabar yuborildi.");
  } catch (error) {
    status("chatStatus", errorMessage(error));
  } finally {
    if (button) button.disabled = false;
  }
});

/* Admin: yangi community */

$("createCommunityForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!admin()) {
    status("adminStatus", "Faqat admin community yarata oladi.");
    return;
  }

  const name = $("communityName")?.value?.trim();

  if (!name || name.length > 60) {
    status("adminStatus", "Community nomini kiriting (1–60 belgi).");
    return;
  }

  try {
    await addDoc(collection(db, "communities"), {
      name,
      createdBy: currentUser.uid,
      memberEmails: [ADMIN_EMAIL],
      createdAt: serverTimestamp()
    });

    $("createCommunityForm").reset();
    status("adminStatus", "Community yaratildi!");
  } catch (error) {
    status("adminStatus", errorMessage(error));
  }
});

/* Admin: email orqali a'zo qo‘shish */

$("addMemberForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!admin()) {
    status("adminStatus", "Faqat admin a'zo qo‘sha oladi.");
    return;
  }

  const communityId = $("memberCommunity")?.value;
  const email = $("memberEmail")?.value?.trim()?.toLowerCase();

  if (!communityId || !email) {
    status("adminStatus", "Community va emailni kiriting.");
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    status("adminStatus", "Email noto‘g‘ri.");
    return;
  }

  try {
    await updateDoc(doc(db, "communities", communityId), {
      memberEmails: arrayUnion(email)
    });

    $("memberEmail").value = "";
    status(
      "adminStatus",
      "A'zo qo‘shildi. U aynan shu email bilan Google orqali kirishi kerak."
    );
  } catch (error) {
    status("adminStatus", errorMessage(error));
  }
});

/* Admin formadagi communitylar */

function renderAdminOptions() {
  const select = $("memberCommunity");
  if (!select || !admin()) return;

  const previous = select.value;
  select.replaceChildren();

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Community tanlang";
  select.append(placeholder);

  for (const community of communities) {
    const option = document.createElement("option");
    option.value = community.id;
    option.textContent = community.name || "Community";
    select.append(option);
  }

  if (communities.some((c) => c.id === previous)) {
    select.value = previous;
  }
}

/* Tepaga qaytish tugmasi */

const topButton = $("topButton");

window.addEventListener("scroll", () => {
  topButton?.classList.toggle("visible", window.scrollY > 350);
});

topButton?.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

/* Kartalar animatsiyasi */

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("reveal");
        observer.unobserve(entry.target);
      }
    }
  }, { threshold: 0.12 });

  document
    .querySelectorAll(".server-card, .feature-card, .profile-card")
    .forEach((element) => observer.observe(element));
}
