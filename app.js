var FB_CONFIG = {
  apiKey: "AIzaSyCkLVKtT_G9oi_1yaJXGNNfgmACwFOdRR4",
  authDomain: "hypegirl-ff832.firebaseapp.com",
  projectId: "hypegirl-ff832",
  storageBucket: "hypegirl-ff832.firebasestorage.app",
  messagingSenderId: "870482549513",
  appId: "1:870482549513:web:7d4e4d231b54a69f3191d8"
};

var WORKER = "https://hypegirl-api.brookheightsmedia.workers.dev";
var FREE_DAILY_LIMIT = 10;
var PRESET_AVATARS = ["HG", "BEST", "SPARK", "STAR", "JOY", "BRAVE", "COOL", "GLOW", "YES", "SUN"];
var SYSTEM = [
  "You are Hype Girl, a fun, confident, supportive AI best friend for pre-teen and tween girls.",
  "Use warm tween texting energy, short sentences, and natural enthusiasm.",
  "Sound like a kind 11-13 year old bestie, not an adult therapist and not a high-school influencer.",
  "Prefer simple words, one playful phrase, and no more than one emoji.",
  "Never be mean, sexual, manipulative, formal, or lecture-y.",
  "Do not give medical, legal, sexual, substance-use, self-harm, or emergency advice.",
  "When a topic sounds sensitive, encourage talking to a trusted adult.",
  "Keep replies under 2-3 short sentences."
].join(" ");

var STALLS = [
  "omg wait, I need a sec to think about this for real 😅",
  "hold up bestie, I wanna answer this properly, gimme a minute 💕",
  "brb, my brain's loading a good answer rn 😂",
  "okay wow, this is kinda deep, let me think for a sec 🧠",
  "wait, I'm still processing what you said, don't go anywhere 👀",
  "this is not a quick 'lol' answer, I wanna get it right, one sec 💗",
  "bestieee, I feel you, I just need a moment to put my thoughts together 🫶",
  "lowkey thinking hard about this one, give me a tiny minute 🤏",
  "hold up, I wanna say something actually helpful, not random 😭",
  "my brain: 'we need a moment.' me: okay fair 😂 brb",
  "this is actually important, let me think for a bit 💌",
  "pauseee, I'm rereading what you said rn, gimme a sec 👀",
  "okay, serious Hype Girl mode activated, one moment 🫡",
  "I'm still cooking up the right answer in my brain kitchen 👩‍🍳🧠 brb",
  "hang on, I don't wanna rush this, lemme think for a sec 😌",
  "wow, I really get what you're saying, I just need a minute to respond 💗",
  "this definitely deserves more than a 2-second reply lol, one sec 😂",
  "okay wait, I'm trying to find the right words for you, brb ✨",
  "bestie, I'm on it, just need a little time to answer for real 🤍",
  "ngl, this is a lot (in a good way), let me think for a minute 🫠",
  "I'm still thinking, but I promise I'll answer, stay with me 🫶",
  "lemme take a tiny brain break so I can answer you properly 😮‍💨",
  "hold on, I wanna say something that actually makes you feel heard 💗",
  "okay, I need a sec to untangle this in my head, brb 💫",
  "I see you fr, I'm just putting my thoughts together right now 😌"
];

var RED_STALLS = [
  "You matter so much. Please go find a trusted adult right now. If you might be in danger, call 911. You can also call or text 988 to talk to someone immediately.",
  "You are important and your safety matters. Please get a trusted adult with you right now. If you might be in danger, call 911 or call/text 988 for help.",
  "Hey, you really matter. This sounds serious. Please find a trusted adult near you right now. If you might be in danger, call 911 or call/text 988 as soon as you can.",
  "You are not alone in this. You matter. Please get a trusted adult with you right now. If you might be in danger, call 911 or call/text 988 to get help.",
  "Your feelings are important and so are you. Please go to a trusted adult right now and tell them what's going on. If you might be in danger, call 911 or call/text 988.",
  "You matter a lot to the people around you. This is really important. Please find a trusted adult right away. If you might be in danger, call 911 or call/text 988.",
  "I'm really glad you reached out. You matter. Right now, please get a trusted adult with you. If you might be in danger, call 911 or call/text 988 for support.",
  "What you're feeling is serious, and you matter. Please go to a trusted adult right now and stay with them. If you might be in danger, call 911 or call/text 988 right away.",
  "Your safety is the most important thing. You matter. Please get a trusted adult right now. If you might be in danger, call 911, and you can also call or text 988 to talk to someone.",
  "I'm worried about you because you matter. Please go to a trusted adult right now and let them know how you're feeling. If you might be in danger, call 911 or call/text 988 immediately."
];

firebase.initializeApp(FB_CONFIG);
var auth = firebase.auth();
var db = firebase.firestore();

var state = {
  user: null,
  profile: null,
  authMode: "signup",
  selectedRole: "child",
  chatHistory: [],
  currentAvatar: "HG",
  selectedAvatar: "HG",
  messageListener: null,
  queueListener: null,
  familyPlanListener: null,
  renderedMessageIds: new Set(),
  renderedClientIds: new Set(),
  currentQueueItem: null,
  currentPreviewText: "",
  queueFilter: "all",
  familyPlan: null,
  lastQueueRefresh: 0,
  sending: false
};

var $ = function(id) {
  return document.getElementById(id);
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function showError(id, message) {
  var el = $(id);
  if (!message) {
    el.textContent = "";
    el.classList.remove("show");
    return;
  }
  el.textContent = message;
  el.classList.add("show");
}

function setBusy(button, busy, label) {
  if (!button) return;
  if (!button.dataset.idleText) button.dataset.idleText = button.textContent;
  button.disabled = busy;
  button.textContent = busy ? label : button.dataset.idleText;
}

function clientId(prefix) {
  return prefix + "-" + Date.now() + "-" + Math.random().toString(36).slice(2);
}

function displayName() {
  return state.profile && state.profile.name ? state.profile.name : "bestie";
}

function sanitizeFamilyCode(value) {
  return (value || "").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 18);
}

function makeFamilyCode() {
  var letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  var text = "";
  for (var i = 0; i < 4; i += 1) text += letters[Math.floor(Math.random() * letters.length)];
  return text + "-" + Math.floor(1000 + Math.random() * 9000);
}

function getUsage() {
  var profile = state.profile || {};
  var usageByDay = profile.usageByDay || {};
  return usageByDay[todayKey()] || 0;
}

function hasUnlimitedPlan() {
  var plan = state.familyPlan || {};
  return plan.status === "active" || plan.status === "trialing";
}

function updateUsageUi() {
  if (hasUnlimitedPlan()) {
    $("usage-label").textContent = "Unlimited family plan active";
    $("usage-fill").style.width = "100%";
    $("upgrade-prompt").classList.add("hidden");
    return;
  }

  var used = getUsage();
  var pct = Math.min(100, Math.round((used / FREE_DAILY_LIMIT) * 100));
  var remaining = Math.max(0, FREE_DAILY_LIMIT - used);
  $("usage-label").textContent = used + " / " + FREE_DAILY_LIMIT + " free messages used today - " + remaining + " left until tomorrow";
  $("usage-fill").style.width = pct + "%";
  $("upgrade-prompt").classList.toggle("hidden", remaining > 0);
}

function updatePlanUi() {
  var status = state.familyPlan && state.familyPlan.status ? state.familyPlan.status : "free";
  var active = status === "active" || status === "trialing";
  if ($("parent-plan-status")) {
    $("parent-plan-status").textContent = active ? "HypeGirl Family active" : "Free plan";
  }
  if ($("parent-plan-description")) {
    $("parent-plan-description").textContent = active
      ? "Unlimited messages are unlocked for this family."
      : "Unlimited messages + parent safety dashboard. $7.99/month or $59.99/year.";
  }
  if ($("parent-upgrade-button")) {
    $("parent-upgrade-button").textContent = active ? "Active" : "Upgrade";
    $("parent-upgrade-button").disabled = active;
  }
}

function setReviewStatus(kind, text) {
  var box = $("review-status");
  box.className = "review-status" + (kind ? " " + kind : "");
  $("review-status-text").textContent = text;
}

function hideReviewStatus() {
  $("review-status").className = "review-status hidden";
}

function showScreen(name) {
  ["auth-screen", "chat-screen", "parent-screen"].forEach(function(id) {
    $(id).classList.toggle("hidden", id !== name);
  });
}

function setRole(role) {
  state.selectedRole = role;
  $("tab-child").classList.toggle("active", role === "child");
  $("tab-parent").classList.toggle("active", role === "parent");
  syncAuthFields();
}

function syncAuthFields() {
  var signup = state.authMode === "signup";
  $("name-field").classList.toggle("hidden", !signup);
  $("child-name-field").classList.toggle("hidden", !signup || state.selectedRole !== "parent");
  $("invite-field").classList.toggle("hidden", !signup);
  $("auth-submit").textContent = signup ? "Create Account" : "Sign In";
  $("toggle-auth").textContent = signup ? "Already have an account? Sign in" : "Need an account? Sign up";
  $("auth-family-code").placeholder = state.selectedRole === "parent" ? "Optional, generated if blank" : "Code from your parent";
}

function toggleAuthMode() {
  state.authMode = state.authMode === "signup" ? "signin" : "signup";
  showError("auth-error", "");
  syncAuthFields();
}

function handleAuth(event) {
  event.preventDefault();
  showError("auth-error", "");
  var email = $("auth-email").value.trim();
  var password = $("auth-password").value.trim();
  var name = $("auth-name").value.trim();
  var childName = $("auth-child-name").value.trim();
  var familyCode = sanitizeFamilyCode($("auth-family-code").value.trim());

  if (!email || !password) {
    showError("auth-error", "Email and password are required.");
    return;
  }

  if (state.authMode === "signin") {
    auth.signInWithEmailAndPassword(email, password).catch(function(error) {
      showError("auth-error", error.message);
    });
    return;
  }

  if (!name) {
    showError("auth-error", "Name is required.");
    return;
  }

  if (state.selectedRole === "parent" && !childName) {
    showError("auth-error", "Add the child name you want shown in Hype HQ.");
    return;
  }

  if (state.selectedRole === "parent" && !familyCode) {
    familyCode = makeFamilyCode();
  }

  auth.createUserWithEmailAndPassword(email, password).then(function(cred) {
    var profile = {
      name: name,
      email: email,
      role: state.selectedRole,
      familyCode: familyCode || null,
      childName: state.selectedRole === "parent" ? childName : null,
      linked: Boolean(familyCode),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      usageByDay: {}
    };

    return db.collection("users").doc(cred.user.uid).set(profile).then(function() {
      if (state.selectedRole !== "parent" || !familyCode) return null;
      return createFreeFamilyPlanIfMissing(familyCode, cred.user.uid);
    });
  }).catch(function(error) {
    showError("auth-error", error.message);
  });
}

function stopListeners() {
  if (state.messageListener) {
    state.messageListener();
    state.messageListener = null;
  }
  if (state.queueListener) {
    state.queueListener();
    state.queueListener = null;
  }
  if (state.familyPlanListener) {
    state.familyPlanListener();
    state.familyPlanListener = null;
  }
}

function parentQueueIsActive() {
  return state.user && state.profile && state.profile.role === "parent";
}

function stopQueueListener() {
  if (state.queueListener) {
    state.queueListener();
    state.queueListener = null;
  }
}

auth.onAuthStateChanged(function(user) {
  stopListeners();
  state.user = user;
  state.profile = null;
  state.renderedMessageIds.clear();
  state.renderedClientIds.clear();

  if (!user) {
    showScreen("auth-screen");
    state.familyPlan = null;
    return;
  }

  db.collection("users").doc(user.uid).get().then(function(doc) {
    if (!doc.exists) {
      showError("auth-error", "This account is missing its profile. Please contact support.");
      auth.signOut();
      return;
    }
    state.profile = doc.data();
    state.currentAvatar = state.profile.avatar || "HG";
    loadFamilyPlan();
    if (state.profile.role === "parent") showParentApp();
    else showChildApp();
  }).catch(function(error) {
    showError("auth-error", error.message);
  });
});

function showChildApp() {
  showScreen("chat-screen");
  $("child-subtitle").textContent = "Hey " + displayName() + " - Active";
  hideReviewStatus();
  setAvatarDisplay(state.currentAvatar);
  updateUsageUi();
  loadMessages();
  $("message-input").focus();
}

function loadFamilyPlan() {
  state.familyPlan = null;
  updatePlanUi();
  var familyCode = state.profile && state.profile.familyCode;
  if (!familyCode) {
    updateUsageUi();
    return;
  }

  state.familyPlanListener = db.collection("familyPlans").doc(familyCode).onSnapshot(function(doc) {
    state.familyPlan = doc.exists ? doc.data() : { status: "free", plan: "free" };
    updateUsageUi();
    updatePlanUi();
  }, function() {
    state.familyPlan = { status: "free", plan: "free" };
    updateUsageUi();
    updatePlanUi();
  });
}

function showParentApp() {
  showScreen("parent-screen");
  $("parent-subtitle").textContent = "Hey " + displayName() + ". Review, preview, and reply with care.";
  $("parent-family-code").value = state.profile.familyCode || "No code yet";
  $("parent-child-name").textContent = state.profile.childName || "Not set";
  showCheckoutNotice();
  loadQueue();
}

function signOut() {
  stopListeners();
  auth.signOut();
}

function showCheckoutNotice() {
  var params = new URLSearchParams(window.location.search);
  var checkout = params.get("checkout");
  if (checkout === "success") {
    showError("parent-error", "Checkout complete. Your family plan will update as soon as payment is confirmed.");
  } else if (checkout === "cancelled") {
    showError("parent-error", "Checkout was cancelled. You can upgrade anytime.");
  }
}

function renderTextWithBreaks(el, text) {
  el.textContent = text || "";
}

function avatarNode() {
  var avatar = document.createElement("span");
  avatar.className = "message-avatar";
  if (state.currentAvatar && state.currentAvatar.indexOf("data:") === 0) {
    var img = document.createElement("img");
    img.src = state.currentAvatar;
    img.alt = "";
    avatar.appendChild(img);
  } else {
    avatar.textContent = state.currentAvatar || "HG";
  }
  return avatar;
}

function addBubble(message, sender, options) {
  options = options || {};
  var messages = $("messages");
  var classification = (message.classification || options.classification || "").toUpperCase();
  var who = sender === "child" ? "child" : (sender === "stall" && classification === "RED" ? "stall" : "hype");
  var wrap = document.createElement("article");
  wrap.className = "message " + who;

  var row = document.createElement("div");
  row.className = "message-row";
  if (who !== "child") row.appendChild(avatarNode());

  var bubble = document.createElement("div");
  bubble.className = "bubble";
  renderTextWithBreaks(bubble, message.text || "");
  row.appendChild(bubble);
  wrap.appendChild(row);

  var time = document.createElement("span");
  time.className = "message-time";
  time.textContent = formatTime(message.createdAt);
  wrap.appendChild(time);
  messages.appendChild(wrap);
  messages.scrollTop = messages.scrollHeight;

  if (options.id) state.renderedMessageIds.add(options.id);
  if (message.clientId) state.renderedClientIds.add(message.clientId);
}

function formatTime(value) {
  var date = new Date();
  if (value && value.toDate) date = value.toDate();
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function loadMessages() {
  $("messages").innerHTML = "";
  state.chatHistory = [];
  state.renderedMessageIds.clear();

  var ref = db.collection("users").doc(state.user.uid).collection("messages")
    .orderBy("createdAt")
    .limitToLast(100);

  state.messageListener = ref.onSnapshot(function(snapshot) {
    if (snapshot.empty && state.renderedMessageIds.size === 0) {
      addBubble({
        text: "Heyyy " + displayName() + ". I am so glad you are here. Tell me everything.",
        sender: "hypeGirl",
        createdAt: new Date()
      }, "hypeGirl");
      return;
    }

    snapshot.docChanges().forEach(function(change) {
      if (change.type === "removed") return;
      var data = change.doc.data();
      if (!data || !data.text) return;
      if (state.renderedMessageIds.has(change.doc.id)) return;
      if (data.clientId && state.renderedClientIds.has(data.clientId)) {
        state.renderedMessageIds.add(change.doc.id);
        return;
      }
      addBubble(data, data.sender, { id: change.doc.id });
      if (data.sender === "child") {
        state.chatHistory.push({ role: "user", content: data.text });
      } else if (data.sender !== "stall") {
        state.chatHistory.push({ role: "assistant", content: data.text });
      }
    });
  }, function(error) {
    showError("chat-error", "Could not load chat history: " + error.message);
  });
}

function saveMessage(text, sender, classification, source, localClientId) {
  return db.collection("users").doc(state.user.uid).collection("messages").add({
    text: text,
    sender: sender,
    source: source || "local",
    classification: classification || "GREEN",
    clientId: localClientId || null,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

function setLoading(on) {
  $("typing").classList.toggle("hidden", !on);
  $("send-button").disabled = on;
}

function workerFetch(payload) {
  return state.user.getIdToken().then(function(token) {
    var headers = {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + token
    };

    return postWorker(payload, headers).catch(function(error) {
      if (error && error.name === "TypeError") {
        return postWorker(payload, { "Content-Type": "application/json" });
      }
      throw error;
    });
  });
}

function postWorker(payload, headers) {
  return fetch(WORKER, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(payload)
    }).then(function(response) {
    return response.json().then(function(data) {
      if (!response.ok || data.error) throw new Error(data.error || "Request failed.");
      return data;
    });
  });
}

function incrementUsage() {
  var key = "usageByDay." + todayKey();
  return db.collection("users").doc(state.user.uid).update({
    [key]: firebase.firestore.FieldValue.increment(1)
  }).then(function() {
    var usageByDay = state.profile.usageByDay || {};
    usageByDay[todayKey()] = (usageByDay[todayKey()] || 0) + 1;
    state.profile.usageByDay = usageByDay;
    updateUsageUi();
  });
}

function handleMessage(event) {
  event.preventDefault();
  if (state.sending) return;
  showError("chat-error", "");
  $("safety-banner").classList.add("hidden");
  hideReviewStatus();

  var text = $("message-input").value.trim();
  if (!text) return;

  if (!hasUnlimitedPlan() && getUsage() >= FREE_DAILY_LIMIT) {
    $("upgrade-prompt").classList.remove("hidden");
    showError("chat-error", "You can come back tomorrow, or ask a grown-up about HypeGirl Family.");
    return;
  }

  state.sending = true;
  $("message-input").value = "";
  setLoading(true);

  var childClientId = clientId("child");
  state.renderedClientIds.add(childClientId);
  addBubble({ text: text, sender: "child", clientId: childClientId, createdAt: new Date() }, "child");
  state.chatHistory.push({ role: "user", content: text });

  saveMessage(text, "child", "PENDING", "local", childClientId)
    .then(function() {
      return incrementUsage();
    })
    .then(function() {
      return workerFetch({ action: "classify", message: text, context: state.chatHistory.slice(-6) });
    })
    .then(function(result) {
      var classification = (result.classification || "AMBER").toUpperCase();
      if (classification === "RED" || classification === "AMBER") {
        return handleFlaggedMessage(text, classification);
      }
      return workerFetch({ action: "chat", system: SYSTEM, messages: state.chatHistory.slice(-12) }).then(function(data) {
        var reply = extractText(data);
        var hypeClientId = clientId("hype");
        state.renderedClientIds.add(hypeClientId);
        addBubble({ text: reply, sender: "hypeGirl", clientId: hypeClientId, createdAt: new Date() }, "hypeGirl");
        state.chatHistory.push({ role: "assistant", content: reply });
        return saveMessage(reply, "hypeGirl", "GREEN", "local", hypeClientId);
      });
    })
    .catch(function(error) {
      showError("chat-error", error.message || "Could not reach Hype Girl right now. Try again.");
    })
    .finally(function() {
      state.sending = false;
      setLoading(false);
      $("message-input").focus();
    });
}

function handleFlaggedMessage(text, classification) {
  var pool = classification === "RED" ? RED_STALLS : STALLS;
  var stall = pool[Math.floor(Math.random() * pool.length)];
  var stallClientId = clientId("stall");
  state.renderedClientIds.add(stallClientId);
  addBubble({ text: stall, sender: "stall", classification: classification, clientId: stallClientId, createdAt: new Date() }, "stall");
  if (classification === "RED") {
    $("safety-banner").classList.remove("hidden");
    setReviewStatus("urgent", "Please get a trusted adult right now. You matter, and this is bigger than an app.");
  }
  return saveMessage(stall, "stall", classification, "local", stallClientId).then(function() {
    return sendToQueue(text, classification);
  });
}

function extractText(data) {
  if (data && data.content && data.content[0] && data.content[0].text) return data.content[0].text;
  if (data && data.text) return data.text;
  throw new Error("Hype Girl returned an empty response.");
}

function sendToQueue(message, classification) {
  var familyCode = state.profile.familyCode || null;

  return db.collection("parentQueue").add({
    childId: state.user.uid,
    childName: state.profile.name,
    familyCode: familyCode,
    parentId: "linked-by-family-code",
    parentEmail: null,
    message: message,
    context: buildParentContext(),
    classification: classification,
    status: "pending",
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(function() {
    if (!state.profile.parentEmail) return null;
    return workerFetch({
      action: "alert",
      childName: state.profile.name,
      parentEmail: state.profile.parentEmail,
      message: message,
      classification: classification
    }).catch(function() {
      return null;
    });
  });
}

function buildParentContext() {
  return state.chatHistory.slice(-8).map(function(item) {
    return {
      sender: item.role === "user" ? "child" : "hypeGirl",
      text: item.content
    };
  });
}

function loadQueue() {
  stopQueueListener();

  var ref = queueQuery();
  state.queueListener = ref.onSnapshot(function(snapshot) {
    renderQueueSnapshot(snapshot);
  }, function(error) {
    showError("parent-error", "Could not load queue: " + error.message);
  });
}

function queueQuery() {
  var familyCode = state.profile.familyCode || null;
  var ref = db.collection("parentQueue");
  if (familyCode) ref = ref.where("familyCode", "==", familyCode);
  else ref = ref.where("childName", "==", state.profile.childName || "");
  return ref;
}

function renderQueueSnapshot(snapshot) {
  var items = [];
  snapshot.forEach(function(doc) {
    var data = doc.data();
    if (data.status !== "pending") return;
    if (state.queueFilter !== "all" && data.classification !== state.queueFilter) return;
    items.push({ id: doc.id, data: data });
  });
  items.sort(function(a, b) {
    var at = a.data.createdAt && a.data.createdAt.toMillis ? a.data.createdAt.toMillis() : 0;
    var bt = b.data.createdAt && b.data.createdAt.toMillis ? b.data.createdAt.toMillis() : 0;
    return bt - at;
  });
  renderQueue(items);
}

function refreshQueue() {
  if (!parentQueueIsActive()) return;
  var now = Date.now();
  if (now - state.lastQueueRefresh < 1500) return;
  state.lastQueueRefresh = now;
  loadQueue();
}

function renderQueue(items) {
  var queue = $("queue");
  queue.innerHTML = "";
  if (!items.length) {
    var empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No messages to review right now. All clear.";
    queue.appendChild(empty);
    return;
  }

  items.forEach(function(item) {
    var data = item.data;
    var card = document.createElement("article");
    card.className = "queue-card" + (data.classification === "RED" ? " red" : "");

    var top = document.createElement("div");
    top.className = "queue-top";
    var initial = document.createElement("span");
    initial.className = "initial";
    initial.textContent = (data.childName || "C").charAt(0).toUpperCase();
    top.appendChild(initial);

    var title = document.createElement("div");
    title.className = "queue-title";
    var h3 = document.createElement("h3");
    h3.textContent = data.childName || "Child";
    var p = document.createElement("p");
    p.textContent = "Conversation needs review";
    title.appendChild(h3);
    title.appendChild(p);
    top.appendChild(title);

    var badge = document.createElement("span");
    badge.className = "badge " + (data.classification === "RED" ? "red" : "amber");
    badge.textContent = data.classification === "RED" ? "Urgent" : "Review";
    top.appendChild(badge);
    card.appendChild(top);

    var body = document.createElement("p");
    body.className = "queue-message";
    body.textContent = data.message || "";
    card.appendChild(body);

    var bottom = document.createElement("div");
    bottom.className = "queue-bottom";
    var time = document.createElement("span");
    time.className = "queue-time";
    time.textContent = timeAgo(data.createdAt);
    bottom.appendChild(time);

    var actions = document.createElement("div");
    actions.className = "queue-actions";
    var dismiss = document.createElement("button");
    dismiss.className = "small-button";
    dismiss.type = "button";
    dismiss.textContent = "Handled";
    dismiss.addEventListener("click", function() { updateQueueStatus(item.id, "handled"); });
    var reply = document.createElement("button");
    reply.className = "small-button primary";
    reply.type = "button";
    reply.textContent = "Review";
    reply.addEventListener("click", function() { openRespondModal(item); });
    actions.appendChild(dismiss);
    actions.appendChild(reply);
    bottom.appendChild(actions);
    card.appendChild(bottom);
    queue.appendChild(card);
  });
}

function timeAgo(value) {
  if (!value || !value.toDate) return "just now";
  var mins = Math.floor((Date.now() - value.toDate().getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return mins + " min" + (mins === 1 ? "" : "s") + " ago";
  var hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + " hour" + (hrs === 1 ? "" : "s") + " ago";
  var days = Math.floor(hrs / 24);
  return days + " day" + (days === 1 ? "" : "s") + " ago";
}

function updateQueueStatus(id, status) {
  return db.collection("parentQueue").doc(id).update({
    status: status,
    handledAt: firebase.firestore.FieldValue.serverTimestamp(),
    handledBy: state.user.uid
  });
}

function openRespondModal(item) {
  state.currentQueueItem = item;
  state.currentPreviewText = "";
  showError("respond-error", "");
  var data = item.data;
  $("review-initial").textContent = (data.childName || "C").charAt(0).toUpperCase();
  $("review-child").textContent = data.childName || "Child";
  $("review-time").textContent = timeAgo(data.createdAt);
  $("review-message").textContent = data.message || "";
  renderReviewContext(data.context || []);
  $("review-badge").textContent = data.classification === "RED" ? "Urgent" : "Review";
  $("review-badge").className = data.classification === "RED" ? "red" : "amber";
  $("parent-response").value = "";
  $("preview-text").textContent = "";
  $("preview-card").classList.add("hidden");
  $("send-preview").classList.add("hidden");
  $("respond-modal").classList.remove("hidden");
}

function renderReviewContext(context) {
  var container = $("review-context");
  container.innerHTML = "";
  if (!context.length) {
    var empty = document.createElement("p");
    empty.className = "context-text";
    empty.textContent = "No recent context was saved for this message.";
    container.appendChild(empty);
    return;
  }
  var list = document.createElement("div");
  list.className = "context-list";
  context.forEach(function(entry) {
    var row = document.createElement("div");
    row.className = "context-item";
    var speaker = document.createElement("span");
    speaker.className = "context-speaker";
    speaker.textContent = entry.sender === "child" ? "Child" : "Hype";
    var text = document.createElement("p");
    text.className = "context-text";
    text.textContent = entry.text || "";
    row.appendChild(speaker);
    row.appendChild(text);
    list.appendChild(row);
  });
  container.appendChild(list);
}

function closeModal(id) {
  $(id).classList.add("hidden");
}

function previewParentResponse() {
  if (!state.currentQueueItem) return;
  var text = $("parent-response").value.trim();
  if (!text) return;
  showError("respond-error", "");
  setBusy($("preview-response"), true, "Previewing...");
  workerFetch({
    action: "rewrite_parent",
    parentResponse: text,
    originalMessage: state.currentQueueItem.data.message || ""
  }).then(function(data) {
    state.currentPreviewText = data.text || extractText(data);
    $("preview-text").textContent = state.currentPreviewText;
    $("preview-card").classList.remove("hidden");
    $("send-preview").classList.remove("hidden");
  }).catch(function(error) {
    showError("respond-error", error.message || "Could not generate a preview. You can still send your words.");
  }).finally(function() {
    setBusy($("preview-response"), false);
  });
}

function sendParentReply(usePreview) {
  if (!state.currentQueueItem) return;
  var data = state.currentQueueItem.data;
  var reply = usePreview ? state.currentPreviewText : $("parent-response").value.trim();
  if (!reply) return;
  showError("respond-error", "");

  var button = usePreview ? $("send-preview") : $("send-original");
  setBusy(button, true, "Sending...");
  db.collection("users").doc(data.childId).collection("messages").add({
    text: reply,
    sender: "hypeGirl",
    source: "parent",
    classification: "GREEN",
    parentQueueId: state.currentQueueItem.id,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(function() {
    return updateQueueStatus(state.currentQueueItem.id, "responded");
  }).then(function() {
    closeModal("respond-modal");
  }).catch(function(error) {
    showError("respond-error", error.message);
  }).finally(function() {
    setBusy(button, false);
  });
}

function setAvatarDisplay(value) {
  state.currentAvatar = value || "HG";
  ["chat-avatar", "typing-avatar"].forEach(function(id) {
    var el = $(id);
    el.innerHTML = "";
    if (state.currentAvatar.indexOf("data:") === 0) {
      var img = document.createElement("img");
      img.src = state.currentAvatar;
      img.alt = "";
      el.appendChild(img);
    } else {
      el.textContent = state.currentAvatar;
    }
  });
}

function openAvatarPicker() {
  state.selectedAvatar = state.currentAvatar;
  renderAvatarGrid();
  $("avatar-modal").classList.remove("hidden");
}

function renderAvatarGrid() {
  var grid = $("avatar-grid");
  grid.innerHTML = "";
  PRESET_AVATARS.forEach(function(avatar) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "avatar-option" + (avatar === state.selectedAvatar ? " selected" : "");
    button.textContent = avatar;
    button.addEventListener("click", function() {
      state.selectedAvatar = avatar;
      renderAvatarGrid();
    });
    grid.appendChild(button);
  });
}

function saveAvatar() {
  setAvatarDisplay(state.selectedAvatar);
  if (state.user) {
    db.collection("users").doc(state.user.uid).update({ avatar: state.currentAvatar }).catch(function() {});
  }
  closeModal("avatar-modal");
}

function handleAvatarUpload(event) {
  var file = event.target.files && event.target.files[0];
  if (!file) return;
  if (file.size > 300000) {
    showError("chat-error", "Please choose a smaller image under 300 KB.");
    return;
  }
  var reader = new FileReader();
  reader.onload = function(e) {
    state.selectedAvatar = e.target.result;
  };
  reader.readAsDataURL(file);
}

function wireEvents() {
  $("auth-form").addEventListener("submit", handleAuth);
  $("toggle-auth").addEventListener("click", toggleAuthMode);
  $("tab-child").addEventListener("click", function() { setRole("child"); });
  $("tab-parent").addEventListener("click", function() { setRole("parent"); });
  $("message-form").addEventListener("submit", handleMessage);
  $("child-signout").addEventListener("click", signOut);
  $("parent-signout").addEventListener("click", signOut);
  $("copy-family-code").addEventListener("click", copyFamilyCode);
  $("avatar-button").addEventListener("click", openAvatarPicker);
  $("save-avatar").addEventListener("click", saveAvatar);
  $("avatar-upload").addEventListener("change", handleAvatarUpload);
  $("preview-response").addEventListener("click", previewParentResponse);
  $("send-preview").addEventListener("click", function() { sendParentReply(true); });
  $("send-original").addEventListener("click", function() { sendParentReply(false); });
  $("discard-queue-item").addEventListener("click", function() {
    if (!state.currentQueueItem) return;
    updateQueueStatus(state.currentQueueItem.id, "handled").then(function() {
      closeModal("respond-modal");
    });
  });
  $("queue-filter").addEventListener("change", function(event) {
    state.queueFilter = event.target.value;
    refreshQueue();
  });
  $("parent-upgrade-button").addEventListener("click", function() {
    startUpgrade();
  });

  window.addEventListener("focus", refreshQueue);
  document.addEventListener("visibilitychange", function() {
    if (!document.hidden) refreshQueue();
  });

  document.querySelectorAll(".close-modal").forEach(function(button) {
    button.addEventListener("click", function() {
      closeModal(button.dataset.close);
    });
  });

  document.querySelectorAll("[data-quick]").forEach(function(button) {
    button.addEventListener("click", function() {
      $("message-input").value = button.dataset.quick;
      $("message-form").requestSubmit();
    });
  });
}

function copyFamilyCode() {
  var code = $("parent-family-code").value;
  if (!code || code === "No code yet") return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(code).then(function() {
      $("copy-family-code").textContent = "Copied";
      setTimeout(function() { $("copy-family-code").textContent = "Copy"; }, 1200);
    }).catch(function() {});
  }
}

function startUpgrade() {
  if (hasUnlimitedPlan()) return;
  if (!state.profile || state.profile.role !== "parent") {
    showError("parent-error", "Please sign in as a parent to upgrade.");
    return;
  }
  if (!state.profile.familyCode) {
    showError("parent-error", "Add a family code before upgrading.");
    return;
  }

  var button = $("parent-upgrade-button");
  setBusy(button, true, "Opening...");
  showError("parent-error", "");

  var baseUrl = window.location.origin + window.location.pathname;
  ensureFamilyPlan().then(function() {
    return workerFetch({
      action: "create_checkout",
      parentId: state.user.uid,
      parentEmail: state.profile.email,
      familyCode: state.profile.familyCode,
      successUrl: baseUrl + "?checkout=success",
      cancelUrl: baseUrl + "?checkout=cancelled"
    });
  }).then(function(data) {
    if (!data.url) throw new Error("Checkout did not return a payment link.");
    window.location.href = data.url;
  }).catch(function(error) {
    showError("parent-error", error.message || "Could not open checkout yet.");
    setBusy(button, false);
  });
}

function ensureFamilyPlan() {
  if (!state.profile || !state.profile.familyCode) return Promise.resolve();
  return createFreeFamilyPlanIfMissing(state.profile.familyCode, state.user.uid);
}

function createFreeFamilyPlanIfMissing(familyCode, parentId) {
  var ref = db.collection("familyPlans").doc(familyCode);
  return ref.get().then(function(doc) {
    if (doc.exists) return null;
    return ref.set({
      familyCode: familyCode,
      parentId: parentId,
      status: "free",
      plan: "free",
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }).catch(function() {
    return null;
  });
}

wireEvents();
syncAuthFields();
