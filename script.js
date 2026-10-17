
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
  getDocs,
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.firebasestorage.app",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

const ADMIN_EMAIL = "diyorbekabdumominov69@gmail.com";

const $ = (id) => document.getElementById(id);

let currentUser = null;
let communities = [];
let stopChatListener = null;

function isAdmin() {
  return currentUser?.email?.toLowerCase() === ADMIN_EMAIL;
}

function showStatus(id, message) {
  $(id).textContent = message;
}

function makeElement(tag, className, text = "") {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

$("loginBtn").addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    alert("Kirish amalga oshmadi: " + error.message);
  }
});

$("logoutBtn").addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    alert("Chiqishda xatolik yuz berdi.");
  }
});

onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  $("loginBtn").hidden = !!user;
  $("logoutBtn").hidden = !user;
  $("userLabel").textContent = user?.displayName || user?.email || "Mehmon";
  $("adminMenu").hidden = !isAdmin();
  $("admin").hidden = !isAdmin();

  if (stopChatListener) {
    stopChatListener();
    stopChatListener = null;
  }

  if (!user) {
    communities = [];
    renderCommunities();
    renderCommunityOptions();
    $("chatMessages").replaceChildren(
      makeElement("p", "muted", "Chat uchun Google orqali kiring.")
    );
    return;
  }

  await loadCommunities();
});

async function loadCommunities() {
  try {
    const ref = collection(db, "communities");

    // Admin barcha community'larni ko‘radi.
    // Oddiy foydalanuvchi faqat o‘zi a’zo bo‘lganlarini ko‘radi.
    const q = isAdmin()
      ? query(ref, orderBy("createdAt", "desc"))
      : query(
          ref,
          where("memberEmails", "array-contains",
            currentUser.email.toLowerCase())
        );

    const snapshot = await getDocs(q);

    communities = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data()
    }));

    renderCommunities();
    renderCommunityOptions();
  } catch (error) {
    showStatus("adminStatus",
      "Community yuklanmadi. Firebase Rules sozlamalarini tekshiring.");
    console.error(error);
  }
}

function renderCommunities() {
  const list = $("communityList");
  list.replaceChildren();

  if (!currentUser) {
    list.append(makeElement("p", "muted",
      "Community’larni ko‘rish uchun Google orqali kiring."));
    return;
  }

  if (!communities.length) {
    list.append(makeElement("p", "muted",
      isAdmin()
        ? "Hali community yo‘q. Admin Panel orqali yarating."
        : "Siz hali hech qaysi community’ga qo‘shilmagansiz."));
    return;
  }

  communities.forEach((community) => {
    const card = makeElement("article", "community-item");
    card.append(makeElement("h3", "", community.name || "Community"));
    card.append(makeElement("p", "muted",
      `A’zolar: ${(community.memberEmails || []).length}`));
    card.append(makeElement("p", "muted",
      isAdmin() ? "Admin boshqaruvi yoqilgan" : "Siz ushbu community a’zosisiz"));
    list.append(card);
  });
}

function renderCommunityOptions() {
  for (const id of ["chatCommunity", "memberCommunity"]) {
    const select = $(id);
    const previousValue = select.value;
    select.replaceChildren();

    const first = document.createElement("option");
    first.value = "";
    first.textContent = "Community tanlang";
    select.append(first);

    communities.forEach((community) => {
      const option = document.createElement("option");
      option.value = community.id;
      option.textContent = community.name;
      select.append(option);
    });

    if (communities.some((c) => c.id === previousValue)) {
      select.value = previousValue;
    }
  }

  if (!$("admin").hidden) {
    $("memberCommunity").disabled = !isAdmin();
  }
}

$("createCommunityForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!isAdmin()) {
    showStatus("adminStatus", "Bu amal faqat admin uchun.");
    return;
  }

  const name = $("communityName").value.trim();
  if (!name) return;

  try {
    await addDoc(collection(db, "communities"), {
      name,
      createdBy: currentUser.email.toLowerCase(),
      memberEmails: [currentUser.email.toLowerCase()],
      createdAt: serverTimestamp()
    });

    $("communityName").value = "";
    showStatus("adminStatus", "Community yaratildi!");
    await loadCommunities();
  } catch (error) {
    showStatus("adminStatus", "Yaratishda xatolik. Firebase Rules'ni tekshiring.");
    console.error(error);
  }
});

$("addMemberForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!isAdmin()) {
    showStatus("adminStatus", "Bu amal faqat admin uchun.");
    return;
  }

  const communityId = $("memberCommunity").value;
  const email = $("memberEmail").value.trim().toLowerCase();

  if (!communityId || !email) {
    showStatus("adminStatus", "Community va emailni kiriting.");
    return;
  }

  try {
    const communityRef = doc(db, "communities", communityId);
    const communitySnap = await getDoc(communityRef);

    if (!communitySnap.exists()) {
      showStatus("adminStatus", "Community topilmadi.");
      return;
    }

    await updateDoc(communityRef, {
      memberEmails: arrayUnion(email)
    });

    $("memberEmail").value = "";
    showStatus("adminStatus",
      `Taklif ro‘yxatiga ${email} qo‘shildi.`);
    await loadCommunities();
  } catch (error) {
    showStatus("adminStatus", "A’zoni qo‘shib bo‘lmadi.");
    console.error(error);
  }
});

$("chatCommunity").addEventListener("change", () => {
  subscribeToChat($("chatCommunity").value);
});

function subscribeToChat(communityId) {
  if (stopChatListener) {
    stopChatListener();
    stopChatListener = null;
  }

  const messages = $("chatMessages");
  messages.replaceChildren();

  if (!currentUser || !communityId) {
    messages.append(makeElement("p", "muted",
      "Chat uchun community tanlang."));
    return;
  }

  const selected = communities.find((c) => c.id === communityId);
  if (!selected) {
    messages.append(makeElement("p", "muted",
      "Bu community siz uchun mavjud emas."));
    return;
  }

  const q = query(
    collection(db, "communities", communityId, "messages"),
    orderBy("createdAt", "desc"),
    limit(100)
  );

  stopChatListener = onSnapshot(q, (snapshot) => {
    messages.replaceChildren();

    const docs = [...snapshot.docs].reverse();

    if (!docs.length) {
      messages.append(makeElement("p", "muted",
        "Birinchi xabarni siz yozing!"));
    }

    docs.forEach((item) => {
      const data = item.data();
      const bubble = makeElement("div", "chat-message");
      bubble.append(makeElement("strong", "",
        data.name || data.email || "Foydalanuvchi"));
      bubble.append(makeElement("p", "", data.text || ""));

      if (data.createdAt?.toDate) {
        bubble.append(makeElement("time", "",
          data.createdAt.toDate().toLocaleString("uz-UZ")));
      }

      messages.append(bubble);
    });

    messages.scrollTop = messages.scrollHeight;
  }, (error) => {
    messages.replaceChildren(
      makeElement("p", "muted",
        "Chatni yuklab bo‘lmadi. Firestore Rules'ni tekshiring.")
    );
    console.error(error);
  });
}

$("chatForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!currentUser) {
    showStatus("chatStatus", "Avval Google orqali kiring.");
    return;
  }

  const communityId = $("chatCommunity").value;
  const text = $("chatInput").value.trim();
  const community = communities.find((c) => c.id === communityId);

  if (!community || !text) {
    showStatus("chatStatus", "Community tanlang va xabar yozing.");
    return;
  }

  if (
    !isAdmin() &&
    !(community.memberEmails || []).includes(
      currentUser.email.toLowerCase()
    )
  ) {
    showStatus("chatStatus", "Siz bu community a’zosi emassiz.");
    return;
  }

  $("chatInput").disabled = true;

  try {
    await addDoc(
      collection(db, "communities", communityId, "messages"),
      {
        text,
        email: currentUser.email.toLowerCase(),
        name: currentUser.displayName || currentUser.email,
        uid: currentUser.uid,
        createdAt: serverTimestamp()
      }
    );

    $("chatInput").value = "";
    showStatus("chatStatus", "");
  } catch (error) {
    showStatus("chatStatus",
      "Xabar yuborilmadi. Firebase Rules'ni tekshiring.");
    console.error(error);
  } finally {
    $("chatInput").disabled = false;
  }
});
