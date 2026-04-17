import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "./supabase";

const TOPICS = [
  { id: "grocery", de: "Im Supermarkt", ru: "В супермаркете", emoji: "🛒" },
  { id: "doctor", de: "Beim Arzt", ru: "У врача", emoji: "🏥" },
  { id: "cafe", de: "Im Café", ru: "В кафе", emoji: "☕" },
  { id: "transport", de: "Mit dem Bus / der Bahn", ru: "В транспорте", emoji: "🚌" },
  { id: "neighbors", de: "Mit Nachbarn sprechen", ru: "Разговор с соседями", emoji: "🏘️" },
  { id: "weather", de: "Über das Wetter", ru: "О погоде", emoji: "🌤️" },
  { id: "pharmacy", de: "In der Apotheke", ru: "В аптеке", emoji: "💊" },
  { id: "bank", de: "Auf der Bank", ru: "В банке", emoji: "🏦" },
];

// ── LOCAL STORAGE FALLBACK ────────────────────────────────────────────────────
function loadVocabLocal() {
  try { return JSON.parse(localStorage.getItem("deutsch_vocab") || "[]"); } catch { return []; }
}
function saveVocabLocal(list) {
  try { localStorage.setItem("deutsch_vocab", JSON.stringify(list)); } catch {}
}

// ── SUPABASE VOCAB OPS ────────────────────────────────────────────────────────
async function loadVocabRemote(userId) {
  const { data, error } = await supabase
    .from("vocab")
    .select("*")
    .eq("user_id", userId)
    .order("saved_at", { ascending: false });
  if (error) {
    console.error("[vocab] load failed:", error.message, error);
    throw error;                // let the caller decide the fallback
  }
  return data || [];
}

async function insertVocabRemote(userId, entry) {
  const { error } = await supabase.from("vocab").insert({
    user_id: userId,
    word: entry.word,
    translation: entry.translation,
    example_de: entry.example_de || "",
    example_ru: entry.example_ru || "",
    confidence: entry.confidence ?? null,
    saved_at: new Date(entry.savedAt || Date.now()).toISOString(),
  });
  if (error) {
    console.error("[vocab] insert failed:", error.message, error);
    return false;
  }
  return true;
}

async function updateConfidenceRemote(userId, word, confidence) {
  const { error } = await supabase
    .from("vocab")
    .update({ confidence })
    .eq("word", word)
    .eq("user_id", userId);
  if (error) console.error("[vocab] update confidence failed:", error.message, error);
  return !error;
}

async function deleteVocabRemote(userId, word) {
  const { error } = await supabase
    .from("vocab")
    .delete()
    .eq("word", word)
    .eq("user_id", userId);
  if (error) console.error("[vocab] delete failed:", error.message, error);
  return !error;
}

// ── CLAUDE API ───────────────────────────────────────────────────────────────
async function callClaude(messages, system) {
  const response = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system,
      messages,
    }),
  });
  const data = await response.json();
  return data.content?.[0]?.text || "";
}

// ── LOGIN SCREEN ─────────────────────────────────────────────────────────────
function LoginScreen() {
  const [loading, setLoading] = useState(false);

  const signIn = async () => {
    setLoading(true);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
  };

  return (
    <div style={s.loginWrap}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Nunito:wght@400;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #2d4a22; }
      `}</style>
      <div style={s.loginInner}>
        <div style={s.loginFlag}>🇩🇪 → 🇷🇺</div>
        <h1 style={s.loginTitle}>Deutsch<br />üben</h1>
        <p style={s.loginDesc}>
          Практикуй немецкий каждый день —<br />
          разговоры, сканер текста и карточки слов.
        </p>
        <button onClick={signIn} disabled={loading} style={s.googleBtn}>
          {loading ? (
            <span>Загружаем…</span>
          ) : (
            <>
              <GoogleIcon />
              <span>Войти через Google</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.29-8.16 2.29-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

// ── USER AVATAR + SIGN OUT ───────────────────────────────────────────────────
function UserAvatar({ user, onSignOut }) {
  const [open, setOpen] = useState(false);
  const avatarUrl = user?.user_metadata?.avatar_url;
  const name = user?.user_metadata?.full_name || user?.email || "";

  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} style={s.avatarBtn}>
        {avatarUrl
          ? <img src={avatarUrl} alt={name} style={s.avatarImg} referrerPolicy="no-referrer" />
          : <div style={s.avatarFallback}>{name[0]?.toUpperCase() || "?"}</div>
        }
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={s.avatarBackdrop} />
          <div style={s.avatarMenu}>
            <div style={s.avatarName}>{name}</div>
            <button onClick={() => { setOpen(false); onSignOut(); }} style={s.signOutBtn}>
              Выйти
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── CHAT VIEW ────────────────────────────────────────────────────────────────
function ChatView({ topic, onBack }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const bottomRef = useRef(null);

  const systemPrompt = `Du bist ein freundlicher Deutschlehrer für russischsprachige Anfänger (Niveau B1).
Das Thema des Gesprächs ist: "${topic.de}" (auf Russisch: "${topic.ru}").
Regeln:
1. Führe ein natürliches Gespräch auf Deutsch über das gewählte Thema.
2. Halte die Sätze einfach und klar (B1-Niveau).
3. Wenn der Nutzer einen Fehler macht, korrigiere ihn freundlich und erkläre kurz auf Russisch, warum (Präfix "💡 Подсказка:").
4. Stelle am Ende jeder Antwort eine Folgefrage.
5. Wenn der Nutzer etwas auf Russisch schreibt, antworte auf Deutsch und gib die Übersetzung in Klammern.`;

  const startConversation = async () => {
    setStarted(true);
    setLoading(true);
    const opener = await callClaude(
      [{ role: "user", content: `Beginne das Gespräch über das Thema: ${topic.de}` }],
      systemPrompt
    );
    setMessages([{ role: "assistant", content: opener }]);
    setLoading(false);
  };

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    const reply = await callClaude(newMessages, systemPrompt);
    setMessages([...newMessages, { role: "assistant", content: reply }]);
    setLoading(false);
  };

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const renderMsg = (content) => {
    const parts = content.split(/(💡 Подсказка:[^\n]+)/g);
    return parts.map((part, i) =>
      part.startsWith("💡 Подсказка:") ? (
        <div key={i} style={s.hint}>{part}</div>
      ) : <span key={i}>{part}</span>
    );
  };

  return (
    <div style={s.chatWrap}>
      <div style={s.chatHeader}>
        <button onClick={onBack} style={s.backBtn}>← Назад</button>
        <div>
          <div style={s.chatTitle}>{topic.emoji} {topic.de}</div>
          <div style={s.chatSub}>{topic.ru}</div>
        </div>
      </div>
      <div style={s.messages}>
        {!started ? (
          <div style={s.startPrompt}>
            <div style={{ fontSize: 60 }}>{topic.emoji}</div>
            <div style={s.topicBigText}>{topic.de}</div>
            <div style={s.topicBigRu}>{topic.ru}</div>
            <button onClick={startConversation} style={s.startBtn}>Gespräch beginnen →</button>
          </div>
        ) : (
          <>
            {messages.map((m, i) => (
              <div key={i} style={m.role === "user" ? s.userBubble : s.aiBubble}>
                {renderMsg(m.content)}
              </div>
            ))}
            {loading && (
              <div style={s.aiBubble}>
                <span style={{ display: "inline-flex", gap: 4 }}>
                  {[0, 1, 2].map(i => (
                    <span key={i} style={{ display: "inline-block", animation: `dotBounce 1s ${i * 0.2}s infinite` }}>●</span>
                  ))}
                </span>
              </div>
            )}
            <div ref={bottomRef} />
          </>
        )}
      </div>
      {started && (
        <div style={s.inputRow}>
          <input style={s.textInput} value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Schreib auf Deutsch…" disabled={loading} />
          <button onClick={send} style={s.sendBtn} disabled={loading || !input.trim()}>➤</button>
        </div>
      )}
    </div>
  );
}

// ── SCANNER VIEW ─────────────────────────────────────────────────────────────
function ScannerView({ onBack, user }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedWord, setSelectedWord] = useState(null);
  const [translation, setTranslation] = useState(null);
  const [translating, setTranslating] = useState(false);
  const [mode, setMode] = useState("upload");
  const [saved, setSaved] = useState(false);
  const fileRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    setLoading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result.split(",")[1];
      const mediaType = file.type || "image/jpeg";
      const response = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
              { type: "text", text: "Extract ALL German text from this image. Return only the plain text, preserving line breaks. No commentary." }
            ]
          }]
        }),
      });
      const data = await response.json();
      setText(data.content?.[0]?.text || "");
      setMode("result");
      setLoading(false);
    };
    reader.readAsDataURL(file);
  };

  const tapWord = async (word) => {
    const clean = word.replace(/[^a-zA-ZäöüÄÖÜß-]/g, "");
    if (!clean || clean.length < 2) return;
    setSelectedWord(clean);
    setTranslation(null);
    setSaved(false);
    setTranslating(true);
    const result = await callClaude(
      [{ role: "user", content: `Translate the German word "${clean}" to Russian. Return JSON only:\n{"word":"${clean}","translation":"Russian translation","example_de":"simple German example sentence","example_ru":"Russian translation of the example"}` }],
      "You are a German-Russian dictionary. Always respond with valid JSON only, no markdown, no extra text."
    );
    try {
      setTranslation(JSON.parse(result.replace(/```json|```/g, "").trim()));
    } catch {
      setTranslation({ word: clean, translation: result, example_de: "", example_ru: "" });
    }
    setTranslating(false);
  };

  const saveWord = async () => {
    if (!translation) return;
    const entry = { ...translation, confidence: null, savedAt: Date.now() };
    // Always persist locally first (offline fallback)
    const local = loadVocabLocal();
    if (!local.find(v => v.word === entry.word)) {
      saveVocabLocal([entry, ...local]);
    }
    // Sync to Supabase and log if it fails
    if (user) {
      const ok = await insertVocabRemote(user.id, entry);
      if (!ok) console.warn("[vocab] remote save failed — word is in localStorage only:", entry.word);
    }
    setSaved(true);
  };

  const words = text.split(/(\s+)/);

  return (
    <div style={s.scanWrap}>
      <div style={s.chatHeader}>
        <button onClick={onBack} style={s.backBtn}>← Назад</button>
        <div>
          <div style={s.chatTitle}>📰 Текст сканер</div>
          <div style={s.chatSub}>Нажми на слово для перевода</div>
        </div>
      </div>

      {mode === "upload" ? (
        <div style={s.uploadArea} onClick={() => fileRef.current?.click()}>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
            onChange={(e) => handleFile(e.target.files[0])} />
          {loading ? (
            <div style={s.uploadText}>⏳ Читаю текст…</div>
          ) : (
            <>
              <div style={{ fontSize: 60 }}>📷</div>
              <div style={s.uploadText}>Загрузи фото газеты или текста</div>
              <div style={s.uploadSub}>Нажми чтобы выбрать файл</div>
            </>
          )}
        </div>
      ) : (
        <>
          <div style={s.textArea}>
            {words.map((w, i) =>
              /\s/.test(w) ? <span key={i}>{w}</span> : (
                <span key={i} onClick={() => tapWord(w)}
                  style={{ ...s.tapWord, ...(selectedWord === w.replace(/[^a-zA-ZäöüÄÖÜß-]/g, "") ? s.tapWordActive : {}) }}>
                  {w}
                </span>
              )
            )}
          </div>

          {(selectedWord || translating) && (
            <div style={s.translationCard}>
              {translating ? (
                <div style={{ textAlign: "center", opacity: 0.7, padding: 8 }}>Перевожу…</div>
              ) : translation ? (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                    <div>
                      <div style={s.transWord}>{translation.word}</div>
                      <div style={s.transRu}>{translation.translation}</div>
                    </div>
                    <button onClick={saveWord} style={{ ...s.saveWordBtn, ...(saved ? s.saveWordBtnSaved : {}) }}>
                      {saved ? "✓ Сохранено" : "+ В словарик"}
                    </button>
                  </div>
                  {translation.example_de && (
                    <div style={s.transExample}>
                      <span style={s.exampleDe}>📝 {translation.example_de}</span>
                      <span style={s.exampleRu}>{translation.example_ru}</span>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          )}

          <button onClick={() => { setMode("upload"); setText(""); setSelectedWord(null); setTranslation(null); setSaved(false); }}
            style={s.newScanBtn}>+ Новое фото</button>
        </>
      )}
    </div>
  );
}

// ── VOCAB / FLASHCARD VIEW ───────────────────────────────────────────────────
function VocabView({ onBack, user }) {
  const [vocab, setVocab] = useState([]);
  const [mode, setMode] = useState("list");
  const [deck, setDeck] = useState([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [filterConf, setFilterConf] = useState("all");
  const [loadingVocab, setLoadingVocab] = useState(true);

  useEffect(() => {
    (async () => {
      setLoadingVocab(true);
      const localList = loadVocabLocal();

      if (user) {
        let remoteList = [];
        try {
          remoteList = await loadVocabRemote(user.id);
        } catch (err) {
          // Supabase unreachable — fall back to localStorage entirely
          console.warn("[vocab] falling back to localStorage:", err.message);
          setVocab(localList);
          setLoadingVocab(false);
          return;
        }

        // Find words saved locally that never made it to Supabase
        const remoteWords = new Set(remoteList.map(v => v.word));
        const pendingLocal = localList.filter(v => !remoteWords.has(v.word));

        if (pendingLocal.length > 0) {
          console.log("[vocab] syncing", pendingLocal.length, "local-only word(s) to Supabase");
          await Promise.all(pendingLocal.map(e => insertVocabRemote(user.id, e)));
          // Re-fetch after sync so we have the canonical remote list
          try { remoteList = await loadVocabRemote(user.id); } catch { /* keep what we have */ }
        }

        // Merge: show remote words + any local-only words that still failed to sync
        const finalRemoteWords = new Set(remoteList.map(v => v.word));
        const stillLocal = localList.filter(v => !finalRemoteWords.has(v.word));
        const merged = [
          ...remoteList.map(v => ({ ...v, savedAt: v.savedAt ?? new Date(v.saved_at).getTime() })),
          ...stillLocal,
        ];
        setVocab(merged);
      } else {
        setVocab(localList);
      }

      setLoadingVocab(false);
    })();
  }, [user]);

  const updateConf = useCallback(async (word, confidence) => {
    const updated = vocab.map(v => v.word === word ? { ...v, confidence } : v);
    setVocab(updated);
    saveVocabLocal(updated);
    if (user) await updateConfidenceRemote(user.id, word, confidence);
  }, [vocab, user]);

  const deleteWord = useCallback(async (word) => {
    const updated = vocab.filter(v => v.word !== word);
    setVocab(updated);
    saveVocabLocal(updated);
    if (user) await deleteVocabRemote(user.id, word);
  }, [vocab, user]);

  const filtered = filterConf === "all" ? vocab : vocab.filter(v => v.confidence === filterConf);

  const startFlash = () => {
    if (filtered.length === 0) return;
    const cards = filtered.flatMap(v => [
      { ...v, direction: "de" },
      { ...v, direction: "ru" },
    ]).sort(() => Math.random() - 0.5);
    setDeck(cards);
    setCardIndex(0);
    setFlipped(false);
    setMode("flash");
  };

  const nextCard = (conf) => {
    updateConf(deck[cardIndex].word, conf);
    if (cardIndex + 1 < deck.length) {
      setCardIndex(i => i + 1);
      setFlipped(false);
    } else {
      setMode("done");
    }
  };

  // ── FLASHCARD MODE ──
  if (mode === "flash" && deck.length > 0) {
    const card = deck[cardIndex];
    const isDeToRu = card.direction === "de";
    const prompt = isDeToRu ? card.word : card.translation;
    const answer = isDeToRu ? card.translation : card.word;
    const promptLabel = isDeToRu ? "🇩🇪 Немецкий" : "🇷🇺 Русский";
    const answerLabel = isDeToRu ? "🇷🇺 Перевод" : "🇩🇪 По-немецки";

    return (
      <div style={s.flashWrap}>
        <div style={s.chatHeader}>
          <button onClick={() => setMode("list")} style={s.backBtn}>← Стоп</button>
          <div>
            <div style={s.chatTitle}>🃏 Карточки</div>
            <div style={s.chatSub}>{cardIndex + 1} из {deck.length}</div>
          </div>
        </div>
        <div style={s.flashBody}>
          <div style={s.progressBar}>
            <div style={{ ...s.progressFill, width: `${(cardIndex / deck.length) * 100}%` }} />
          </div>
          <div style={s.card} onClick={() => setFlipped(f => !f)}>
            <div style={{ fontSize: 12, color: "#aaa", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>{promptLabel}</div>
            <div style={s.cardWord}>{prompt}</div>
            {!flipped ? (
              <div style={s.cardHint}>Нажми чтобы увидеть {isDeToRu ? "перевод" : "немецкое слово"}</div>
            ) : (
              <>
                <div style={{ fontSize: 11, color: "#aaa", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginTop: 8 }}>{answerLabel}</div>
                <div style={s.cardTranslation}>{answer}</div>
                {isDeToRu && card.example_de && (
                  <div style={s.cardExample}>
                    <div style={{ fontSize: 13, color: "#6b7a5e", fontStyle: "italic" }}>{card.example_de}</div>
                    <div style={{ fontSize: 12, color: "#aaa", marginTop: 2 }}>{card.example_ru}</div>
                  </div>
                )}
              </>
            )}
          </div>
          {flipped && (
            <div style={s.confButtons}>
              <div style={s.confLabel}>Как хорошо ты знаешь это слово?</div>
              <div style={s.confRow}>
                <button style={{ ...s.confBtn, background: "#fde8e8", color: "#c0392b" }} onClick={() => nextCard("red")}>🔴<br />Не знаю</button>
                <button style={{ ...s.confBtn, background: "#fff9e0", color: "#8a6a00" }} onClick={() => nextCard("yellow")}>🟡<br />Почти</button>
                <button style={{ ...s.confBtn, background: "#e8f5e4", color: "#2d6a1f" }} onClick={() => nextCard("green")}>🟢<br />Знаю!</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── DONE MODE ──
  if (mode === "done") {
    const counts = {
      green: vocab.filter(v => v.confidence === "green").length,
      yellow: vocab.filter(v => v.confidence === "yellow").length,
      red: vocab.filter(v => v.confidence === "red").length,
    };
    return (
      <div style={s.flashWrap}>
        <div style={s.chatHeader}>
          <button onClick={() => setMode("list")} style={s.backBtn}>← Назад</button>
          <div style={s.chatTitle}>🎉 Готово!</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 20, padding: 32 }}>
          <div style={{ fontSize: 64 }}>🌸</div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, color: "#2d4a22", textAlign: "center" }}>Отличная работа!</div>
          <div style={{ display: "flex", gap: 16 }}>
            {[["🟢", counts.green, "Знаю"], ["🟡", counts.yellow, "Почти"], ["🔴", counts.red, "Учить"]].map(([emoji, n, label]) => (
              <div key={label} style={s.statBox}>
                <div style={{ fontSize: 28 }}>{emoji}</div>
                <div style={{ fontWeight: 700, fontSize: 24 }}>{n}</div>
                <div style={{ fontSize: 12, color: "#8a9a7e" }}>{label}</div>
              </div>
            ))}
          </div>
          <button style={s.startBtn} onClick={() => setMode("list")}>В словарик</button>
        </div>
      </div>
    );
  }

  // ── LIST MODE ──
  return (
    <div style={s.vocabWrap}>
      <div style={s.chatHeader}>
        <button onClick={onBack} style={s.backBtn}>← Назад</button>
        <div>
          <div style={s.chatTitle}>📖 Мой словарик</div>
          <div style={s.chatSub}>{vocab.length} слов сохранено</div>
        </div>
      </div>

      {loadingVocab ? (
        <div style={s.emptyVocab}>
          <div style={{ fontSize: 32, opacity: 0.4 }}>⏳</div>
          <div style={{ fontSize: 14, color: "#8a9a7e", marginTop: 8 }}>Загружаю словарик…</div>
        </div>
      ) : vocab.length === 0 ? (
        <div style={s.emptyVocab}>
          <div style={{ fontSize: 56 }}>📝</div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, color: "#2d4a22", marginTop: 12 }}>Пока пусто</div>
          <div style={{ fontSize: 14, color: "#8a9a7e", marginTop: 6, textAlign: "center", lineHeight: 1.6 }}>
            Нажми на слово в сканере и сохрани его — оно появится здесь
          </div>
        </div>
      ) : (
        <>
          <div style={s.vocabToolbar}>
            <div style={s.filterRow}>
              {[
                ["all", `Все (${vocab.length})`],
                ["red", `🔴 ${vocab.filter(v => v.confidence === "red").length}`],
                ["yellow", `🟡 ${vocab.filter(v => v.confidence === "yellow").length}`],
                ["green", `🟢 ${vocab.filter(v => v.confidence === "green").length}`],
              ].map(([key, label]) => (
                <button key={key} onClick={() => setFilterConf(key)}
                  style={{ ...s.filterBtn, ...(filterConf === key ? s.filterBtnActive : {}) }}>
                  {label}
                </button>
              ))}
            </div>
            <button style={s.flashStartBtn} onClick={startFlash} disabled={filtered.length === 0}>
              🃏 Учить карточки ({filtered.length})
            </button>
          </div>

          <div style={s.wordList}>
            {filtered.map((v) => (
              <div key={v.word} style={s.wordRow}>
                <div style={{ ...s.confDot, background: v.confidence === "red" ? "#e74c3c" : v.confidence === "yellow" ? "#d4a017" : v.confidence === "green" ? "#4a7c3f" : "#ccc" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={s.wordDe}>{v.word}</div>
                  <div style={s.wordRu}>{v.translation}</div>
                </div>
                <div style={s.wordActions}>
                  {["red", "yellow", "green"].map(c => (
                    <button key={c} onClick={() => updateConf(v.word, c)}
                      style={{ ...s.miniConfBtn, opacity: v.confidence === c ? 1 : 0.3 }}>
                      {c === "red" ? "🔴" : c === "yellow" ? "🟡" : "🟢"}
                    </button>
                  ))}
                  <button onClick={() => deleteWord(v.word)} style={s.deleteBtn}>✕</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState(undefined); // undefined = still loading
  const [screen, setScreen] = useState("home");
  const [activeTopic, setActiveTopic] = useState(null);
  const [showCustom, setShowCustom] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const [vocabCount, setVocabCount] = useState(0);

  // Auth listener — resolves on first load, then tracks changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Keep vocab count badge fresh
  useEffect(() => {
    if (session === undefined) return;
    if (!session) { setVocabCount(loadVocabLocal().length); return; }
    loadVocabRemote(session.user.id).then(rows => setVocabCount(rows.length));
    const interval = setInterval(() => {
      loadVocabRemote(session.user.id).then(rows => setVocabCount(rows.length));
    }, 10000);
    return () => clearInterval(interval);
  }, [session]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setScreen("home");
  };

  // Auth still resolving — show minimal splash
  if (session === undefined) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#2d4a22" }}>
        <div style={{ color: "rgba(255,255,255,0.5)", fontFamily: "Nunito, sans-serif", fontSize: 28 }}>🇩🇪</div>
      </div>
    );
  }

  // Not signed in → show login
  if (!session) return <LoginScreen />;

  const user = session.user;

  if (screen === "chat") return <ChatView topic={activeTopic} onBack={() => setScreen("home")} />;
  if (screen === "scanner") return <ScannerView onBack={() => setScreen("home")} user={user} />;
  if (screen === "vocab") return <VocabView onBack={() => setScreen("home")} user={user} />;

  const startCustom = () => {
    if (!customInput.trim()) return;
    setActiveTopic({ id: "custom", de: customInput.trim(), ru: "Свободная тема", emoji: "💬" });
    setCustomInput("");
    setShowCustom(false);
    setScreen("chat");
  };

  return (
    <div style={s.app}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Nunito:wght@400;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #f5f0e8; }
        @keyframes dotBounce { 0%,100%{opacity:0.3;transform:translateY(0)} 50%{opacity:1;transform:translateY(-5px)} }
        @keyframes cardIn { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      <div style={s.hero}>
        <div style={s.heroTop}>
          <div style={s.flag}>🇩🇪 → 🇷🇺</div>
          <UserAvatar user={user} onSignOut={handleSignOut} />
        </div>
        <h1 style={s.title}>Deutsch<br />üben</h1>
        <p style={s.sub}>Учим немецкий каждый день</p>
      </div>

      <div style={s.section}>
        <div style={s.sectionLabel}>💬 Разговорная практика</div>
        <div style={s.topicGrid}>
          {TOPICS.map((t) => (
            <button key={t.id} style={s.topicCard}
              onClick={() => { setActiveTopic(t); setScreen("chat"); }}>
              <span style={{ fontSize: 28, lineHeight: 1 }}>{t.emoji}</span>
              <span style={s.topicDe}>{t.de}</span>
              <span style={s.topicRu}>{t.ru}</span>
            </button>
          ))}
        </div>
        <button style={s.customCard} onClick={() => setShowCustom(true)}>
          <span style={{ fontSize: 28 }}>💬</span>
          <div>
            <div style={s.customTitle}>Поговори о чём угодно</div>
            <div style={s.customSub}>Выбери свою тему — о чём хочешь</div>
          </div>
          <span style={s.arrow}>→</span>
        </button>
      </div>

      <div style={s.section}>
        <div style={s.sectionLabel}>📰 Читаем по-немецки</div>
        <button style={s.wideCard} onClick={() => setScreen("scanner")}>
          <span style={{ fontSize: 32 }}>📷</span>
          <div>
            <div style={s.wideCardTitle}>Сканировать текст</div>
            <div style={s.wideCardSub}>Нажми на слово — увидишь перевод</div>
          </div>
          <span style={s.arrow}>→</span>
        </button>
      </div>

      <div style={s.section}>
        <div style={s.sectionLabel}>📖 Мой словарик</div>
        <button style={{ ...s.wideCard, background: "linear-gradient(135deg, #3a2d5a, #6a4aaa)" }}
          onClick={() => setScreen("vocab")}>
          <span style={{ fontSize: 32 }}>🃏</span>
          <div>
            <div style={{ ...s.wideCardTitle, color: "#fff" }}>Карточки и словарик</div>
            <div style={{ ...s.wideCardSub, color: "rgba(255,255,255,0.7)" }}>
              {vocabCount > 0 ? `${vocabCount} слов сохранено` : "Сохраняй новые слова здесь"}
            </div>
          </div>
          <span style={{ ...s.arrow, color: "#c0a8f0" }}>→</span>
        </button>
      </div>

      <div style={s.footer}>Viel Erfolg, Mama! 🌸</div>

      {showCustom && (
        <div style={s.modalOverlay} onClick={() => setShowCustom(false)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <div style={s.modalTitle}>О чём хочешь поговорить?</div>
            <div style={{ fontSize: 14, color: "#8a9a7e" }}>Напиши тему на русском или немецком</div>
            <input style={s.modalInput} value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && startCustom()}
              placeholder="Напр: мои планы на лето, моя семья…" autoFocus />
            <button style={s.modalBtn} onClick={startCustom} disabled={!customInput.trim()}>Начать разговор →</button>
            <button style={s.modalCancel} onClick={() => setShowCustom(false)}>Отмена</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── STYLES ───────────────────────────────────────────────────────────────────
const s = {
  // Login
  loginWrap: { fontFamily: "'Nunito', sans-serif", minHeight: "100vh", background: "linear-gradient(160deg, #1a2e12 0%, #2d4a22 50%, #4a7c3f 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 },
  loginInner: { display: "flex", flexDirection: "column", alignItems: "center", gap: 16, maxWidth: 360, width: "100%", textAlign: "center" },
  loginFlag: { fontSize: 32, letterSpacing: 6 },
  loginTitle: { fontFamily: "'Playfair Display', serif", fontSize: 56, color: "#fff", lineHeight: 1.05 },
  loginDesc: { fontSize: 15, color: "rgba(255,255,255,0.75)", lineHeight: 1.7, maxWidth: 280 },
  googleBtn: { marginTop: 8, display: "flex", alignItems: "center", gap: 12, background: "#fff", color: "#3c3c3c", border: "none", borderRadius: 50, padding: "14px 28px", fontSize: 15, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 20px rgba(0,0,0,0.25)", fontFamily: "'Nunito', sans-serif" },

  // Avatar
  avatarBtn: { background: "rgba(255,255,255,0.15)", border: "2px solid rgba(255,255,255,0.4)", borderRadius: "50%", width: 36, height: 36, padding: 0, cursor: "pointer", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  avatarImg: { width: 36, height: 36, borderRadius: "50%", display: "block" },
  avatarFallback: { color: "#fff", fontWeight: 700, fontSize: 15 },
  avatarBackdrop: { position: "fixed", inset: 0, zIndex: 50 },
  avatarMenu: { position: "absolute", top: 44, right: 0, background: "#fff", borderRadius: 14, padding: "12px 16px", boxShadow: "0 8px 32px rgba(0,0,0,0.18)", minWidth: 160, zIndex: 51, display: "flex", flexDirection: "column", gap: 10 },
  avatarName: { fontSize: 13, color: "#555", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200 },
  signOutBtn: { background: "#fef2f2", color: "#e74c3c", border: "none", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer", textAlign: "left" },

  // Home
  app: { fontFamily: "'Nunito', sans-serif", background: "#f5f0e8", minHeight: "100vh", maxWidth: 480, margin: "0 auto" },
  hero: { background: "linear-gradient(135deg, #2d4a22 0%, #4a7c3f 60%, #6aaa5e 100%)", padding: "16px 16px 32px", color: "#fff" },
  heroTop: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  flag: { fontSize: 24, letterSpacing: 4 },
  title: { fontFamily: "'Playfair Display', serif", fontSize: 48, lineHeight: 1.1, marginBottom: 8 },
  sub: { fontSize: 16, opacity: 0.85, fontWeight: 600 },
  section: { padding: "24px 16px 8px" },
  sectionLabel: { fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, color: "#6b7a5e", marginBottom: 12 },
  topicGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 },
  topicCard: { background: "#fff", border: "none", borderRadius: 16, padding: "14px 12px", cursor: "pointer", textAlign: "left", display: "flex", flexDirection: "column", gap: 4, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" },
  topicDe: { fontSize: 13, fontWeight: 700, color: "#2d4a22", lineHeight: 1.3 },
  topicRu: { fontSize: 11, color: "#8a9a7e", fontWeight: 600 },
  customCard: { background: "linear-gradient(135deg, #2d4a22, #4a7c3f)", border: "none", borderRadius: 16, padding: "16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, width: "100%", color: "#fff", boxShadow: "0 2px 12px rgba(45,74,34,0.25)" },
  customTitle: { fontSize: 15, fontWeight: 700, textAlign: "left" },
  customSub: { fontSize: 12, opacity: 0.75, textAlign: "left", marginTop: 2 },
  wideCard: { background: "#fff", border: "none", borderRadius: 16, padding: "18px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, width: "100%", boxShadow: "0 2px 8px rgba(0,0,0,0.07)" },
  wideCardTitle: { fontSize: 15, fontWeight: 700, color: "#2d4a22", textAlign: "left" },
  wideCardSub: { fontSize: 12, color: "#8a9a7e", textAlign: "left", marginTop: 2 },
  arrow: { fontSize: 20, color: "#4a7c3f", marginLeft: "auto" },
  footer: { textAlign: "center", padding: "24px 16px 48px", fontSize: 15, color: "#8a9a7e", fontWeight: 600 },
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 100 },
  modal: { background: "#fff", borderRadius: "24px 24px 0 0", padding: "28px 20px 40px", width: "100%", maxWidth: 480, display: "flex", flexDirection: "column", gap: 12 },
  modalTitle: { fontFamily: "'Playfair Display', serif", fontSize: 22, color: "#2d4a22", fontWeight: 700 },
  modalInput: { border: "1.5px solid #c8d4c0", borderRadius: 12, padding: "12px 16px", fontSize: 15, fontFamily: "'Nunito', sans-serif", outline: "none", color: "#2d2d2d" },
  modalBtn: { background: "#2d4a22", color: "#fff", border: "none", borderRadius: 50, padding: "14px", fontSize: 15, fontWeight: 700, cursor: "pointer" },
  modalCancel: { background: "none", border: "none", color: "#8a9a7e", fontSize: 14, cursor: "pointer", textAlign: "center" },

  // Chat
  chatWrap: { display: "flex", flexDirection: "column", height: "100vh", background: "#f5f0e8" },
  chatHeader: { background: "#2d4a22", color: "#fff", padding: "14px 16px", display: "flex", alignItems: "center", gap: 14, flexShrink: 0 },
  backBtn: { background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 700, whiteSpace: "nowrap" },
  chatTitle: { fontSize: 16, fontWeight: 700, fontFamily: "'Playfair Display', serif" },
  chatSub: { fontSize: 12, opacity: 0.75 },
  messages: { flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 10 },
  startPrompt: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 10, paddingTop: 60 },
  topicBigText: { fontFamily: "'Playfair Display', serif", fontSize: 26, color: "#2d4a22", textAlign: "center" },
  topicBigRu: { fontSize: 15, color: "#8a9a7e", fontWeight: 600 },
  startBtn: { marginTop: 16, background: "#2d4a22", color: "#fff", border: "none", borderRadius: 50, padding: "14px 32px", fontSize: 15, fontWeight: 700, cursor: "pointer" },
  userBubble: { background: "#2d4a22", color: "#fff", padding: "10px 14px", borderRadius: "18px 18px 4px 18px", alignSelf: "flex-end", maxWidth: "80%", fontSize: 15, lineHeight: 1.5, whiteSpace: "pre-wrap" },
  aiBubble: { background: "#fff", color: "#2d2d2d", padding: "10px 14px", borderRadius: "18px 18px 18px 4px", alignSelf: "flex-start", maxWidth: "85%", fontSize: 15, lineHeight: 1.6, boxShadow: "0 1px 4px rgba(0,0,0,0.08)", whiteSpace: "pre-wrap" },
  hint: { marginTop: 8, background: "#fffbe6", borderLeft: "3px solid #f0c040", padding: "6px 10px", borderRadius: 6, fontSize: 13, color: "#7a6a00", fontStyle: "italic" },
  inputRow: { display: "flex", padding: "12px", gap: 8, background: "#fff", borderTop: "1px solid #e8e4dc", flexShrink: 0 },
  textInput: { flex: 1, border: "1.5px solid #d0cdc4", borderRadius: 50, padding: "10px 16px", fontSize: 15, outline: "none", fontFamily: "'Nunito', sans-serif", background: "#faf9f6" },
  sendBtn: { background: "#2d4a22", color: "#fff", border: "none", borderRadius: "50%", width: 44, height: 44, fontSize: 18, cursor: "pointer", flexShrink: 0 },

  // Scanner
  scanWrap: { display: "flex", flexDirection: "column", height: "100vh", background: "#f5f0e8" },
  uploadArea: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", margin: 20, background: "#fff", borderRadius: 20, border: "2px dashed #c0d4b8", cursor: "pointer", gap: 12 },
  uploadText: { fontSize: 16, fontWeight: 700, color: "#2d4a22" },
  uploadSub: { fontSize: 13, color: "#8a9a7e" },
  textArea: { flex: 1, overflowY: "auto", margin: "12px 16px 0", background: "#fff", borderRadius: 16, padding: "16px", fontSize: 17, lineHeight: 1.9, color: "#2d2d2d", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" },
  tapWord: { cursor: "pointer", borderRadius: 4, padding: "0 1px", transition: "background 0.1s" },
  tapWordActive: { background: "#b8ddb0", color: "#1a3312" },
  translationCard: { margin: "10px 16px", background: "#2d4a22", color: "#fff", borderRadius: 16, padding: "16px 18px", flexShrink: 0 },
  transWord: { fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, marginBottom: 4 },
  transRu: { fontSize: 18, color: "#b8e4a8", fontWeight: 600 },
  transExample: { display: "flex", flexDirection: "column", gap: 2, borderTop: "1px solid rgba(255,255,255,0.2)", paddingTop: 8, marginTop: 8 },
  exampleDe: { fontSize: 13, color: "#d4f0c8", fontStyle: "italic" },
  exampleRu: { fontSize: 13, color: "#8aaa80" },
  saveWordBtn: { background: "rgba(255,255,255,0.15)", border: "1.5px solid rgba(255,255,255,0.4)", color: "#fff", borderRadius: 50, padding: "7px 13px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 },
  saveWordBtnSaved: { background: "#4a7c3f", borderColor: "#4a7c3f" },
  newScanBtn: { margin: "10px 16px 20px", background: "#fff", color: "#2d4a22", border: "2px solid #4a7c3f", borderRadius: 50, padding: "12px", width: "calc(100% - 32px)", fontSize: 14, fontWeight: 700, cursor: "pointer", flexShrink: 0 },

  // Vocab list
  vocabWrap: { display: "flex", flexDirection: "column", height: "100vh", background: "#f5f0e8" },
  emptyVocab: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, padding: 32, gap: 4 },
  vocabToolbar: { padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10, flexShrink: 0 },
  filterRow: { display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 },
  filterBtn: { background: "#fff", border: "1.5px solid #ddd", borderRadius: 50, padding: "6px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", color: "#555" },
  filterBtnActive: { background: "#2d4a22", borderColor: "#2d4a22", color: "#fff" },
  flashStartBtn: { background: "linear-gradient(135deg, #3a2d5a, #6a4aaa)", color: "#fff", border: "none", borderRadius: 12, padding: "13px", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  wordList: { flex: 1, overflowY: "auto", padding: "0 16px 32px" },
  wordRow: { display: "flex", alignItems: "center", gap: 10, background: "#fff", borderRadius: 12, padding: "12px 14px", marginBottom: 8, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" },
  confDot: { width: 10, height: 10, borderRadius: "50%", flexShrink: 0 },
  wordDe: { fontWeight: 700, fontSize: 16, color: "#2d2d2d" },
  wordRu: { fontSize: 13, color: "#8a9a7e", marginTop: 2 },
  wordActions: { display: "flex", gap: 2, alignItems: "center", marginLeft: "auto", flexShrink: 0 },
  miniConfBtn: { background: "none", border: "none", fontSize: 15, cursor: "pointer", padding: "2px" },
  deleteBtn: { background: "none", border: "none", color: "#ccc", cursor: "pointer", fontSize: 16, padding: "2px 4px", marginLeft: 2 },

  // Flashcard
  flashWrap: { display: "flex", flexDirection: "column", height: "100vh", background: "#f5f0e8" },
  flashBody: { flex: 1, display: "flex", flexDirection: "column", padding: "20px 16px", gap: 16, overflowY: "auto" },
  progressBar: { height: 4, background: "#ddd", borderRadius: 2, flexShrink: 0 },
  progressFill: { height: "100%", background: "#4a7c3f", borderRadius: 2, transition: "width 0.4s" },
  card: { background: "#fff", borderRadius: 24, padding: "40px 28px", minHeight: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 20px rgba(0,0,0,0.1)", cursor: "pointer", animation: "cardIn 0.3s ease", gap: 10, textAlign: "center" },
  cardWord: { fontFamily: "'Playfair Display', serif", fontSize: 36, color: "#2d4a22" },
  cardHint: { fontSize: 14, color: "#bbb" },
  cardTranslation: { fontSize: 26, color: "#4a7c3f", fontWeight: 700 },
  cardExample: { borderTop: "1px solid #eee", paddingTop: 12, marginTop: 4, width: "100%" },
  confButtons: { display: "flex", flexDirection: "column", gap: 10, flexShrink: 0 },
  confLabel: { textAlign: "center", fontSize: 14, color: "#8a9a7e", fontWeight: 600 },
  confRow: { display: "flex", gap: 10 },
  confBtn: { flex: 1, border: "none", borderRadius: 16, padding: "14px 8px", fontSize: 13, fontWeight: 700, cursor: "pointer", lineHeight: 1.7 },
  statBox: { background: "#fff", borderRadius: 16, padding: "16px 20px", textAlign: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.07)", minWidth: 80 },
};
