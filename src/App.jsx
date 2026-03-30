import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './App.css'

// Groq API endpoint og nøgle fra .env filen
const API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const API_KEY = import.meta.env.VITE_GROQ_API_KEY

// Opretter et nyt tomt chat-objekt med et unikt id baseret på tidsstempel
function createNewChat() {
  return { id: Date.now(), title: 'Ny chat', messages: [] }
}

// Henter chats fra localStorage, eller returnerer en ny tom chat
function loadChats() {
  try {
    const saved = localStorage.getItem('chats')
    if (saved) return JSON.parse(saved)
  } catch {}
  return [createNewChat()]
}

export default function App() {
  // Liste over alle chats — indlæst fra localStorage ved start
  const [chats, setChats] = useState(loadChats)
  // ID på den chat der er åben lige nu
  const [activeChatId, setActiveChatId] = useState(() => loadChats()[0].id)
  // Teksten brugeren skriver i inputfeltet
  const [input, setInput] = useState('')
  // true mens vi venter på svar fra AI
  const [loading, setLoading] = useState(false)
  // ID på den chat der er ved at blive omdøbt (null = ingen)
  const [renamingId, setRenamingId] = useState(null)
  // Teksten i omdøb-feltet
  const [renameValue, setRenameValue] = useState('')
  // true når sidebjælken er åben på mobil
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // Bruges til at scrolle ned til den nyeste besked automatisk
  const bottomRef = useRef(null)

  // Gemmer chats i localStorage hver gang de ændrer sig
  useEffect(() => {
    localStorage.setItem('chats', JSON.stringify(chats))
  }, [chats])

  // Scroller ned til bunden hver gang der kommer en ny besked
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chats, activeChatId])

  // Finder den aktive chat ud fra id
  const activeChat = chats.find(c => c.id === activeChatId) ?? chats[0]

  // Opdaterer en specifik chat ved hjælp af en updater-funktion
  function updateChat(id, updater) {
    setChats(prev => prev.map(c => c.id === id ? updater(c) : c))
  }

  // Sender brugerens besked og henter svar fra AI
  async function sendMessage() {
    const text = input.trim()
    // Gør ingenting hvis inputtet er tomt eller AI er ved at svare
    if (!text || loading) return

    const userMsg = { role: 'user', text }
    setInput('')
    setLoading(true)
    setSidebarOpen(false) // Luk sidebjælken på mobil når man sender

    // Tilføjer brugerens besked til chatten og sætter titlen på den første besked
    updateChat(activeChat.id, c => ({
      ...c,
      title: c.messages.length === 0 ? text.slice(0, 30) : c.title,
      messages: [...c.messages, userMsg]
    }))

    try {
      // Bygger samtalehistorikken i det format Groq forventer
      const history = activeChat.messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.text
      }))

      // Sender anmodning til Groq API
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}` // API nøgle til godkendelse
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile', // AI-modellen vi bruger
          messages: [
            // System-prompt: fortæller AI'en at den skal svare på dansk
            { role: 'system', content: 'Du er en hjælpsom assistent. Svar altid på dansk, uanset hvilket sprog brugeren skriver på.' },
            ...history,                      // Tidligere beskeder i samtalen
            { role: 'user', content: text }  // Den nye besked fra brugeren
          ]
        })
      })
      const data = await res.json()

      // Kaster en fejl hvis API'et returnerer en fejlkode
      if (!res.ok) {
        throw new Error(`Fejl ${res.status}: ${data.error?.message ?? 'Ukendt fejl'}`)
      }

      // Udtrækker svaret fra AI'ens svar
      const reply = data.choices?.[0]?.message?.content ?? 'Ingen svar modtaget.'

      // Tilføjer AI'ens svar til chatten
      updateChat(activeChat.id, c => ({
        ...c,
        messages: [...c.messages, { role: 'assistant', text: reply }]
      }))
    } catch (err) {
      // Viser fejlbeskeden i chatten hvis noget gik galt
      updateChat(activeChat.id, c => ({
        ...c,
        messages: [...c.messages, { role: 'assistant', text: err.message || 'Der opstod en fejl. Prøv igen.' }]
      }))
    } finally {
      // Slår loading fra uanset om det lykkedes eller ej
      setLoading(false)
    }
  }

  // Opretter en ny tom chat og skifter til den
  function newChat() {
    const chat = createNewChat()
    setChats(prev => [chat, ...prev])
    setActiveChatId(chat.id)
    setSidebarOpen(false)
  }

  // Sletter en chat — hvis den slettede er aktiv, skiftes til en anden
  function deleteChat(id) {
    setChats(prev => {
      const remaining = prev.filter(c => c.id !== id)
      // Hvis alle chats slettes, oprettes en ny automatisk
      if (remaining.length === 0) {
        const fresh = createNewChat()
        setActiveChatId(fresh.id)
        return [fresh]
      }
      // Skift til den første tilgængelige chat hvis den aktive slettes
      if (id === activeChatId) setActiveChatId(remaining[0].id)
      return remaining
    })
  }

  // Starter omdøbning af en chat
  function startRename(chat) {
    setRenamingId(chat.id)
    setRenameValue(chat.title)
  }

  // Gemmer det nye navn på chatten
  function confirmRename(id) {
    const trimmed = renameValue.trim()
    if (trimmed) updateChat(id, c => ({ ...c, title: trimmed }))
    setRenamingId(null)
  }

  // Sender beskeden når brugeren trykker Enter (men ikke Shift+Enter)
  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="layout">
      {/* Mørkt overlay bag sidebjælken på mobil */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebjælke med chat-historik */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <span className="logo">ChatBot</span>
          {/* Knap til at starte en ny chat */}
          <button className="new-chat-btn" onClick={newChat} title="Ny chat">+</button>
        </div>
        {/* Liste over alle chats */}
        <nav className="chat-list">
          {chats.map(c => (
            <div
              key={c.id}
              className={`chat-item ${c.id === activeChat.id ? 'active' : ''}`}
              onClick={() => { setActiveChatId(c.id); setSidebarOpen(false) }}
            >
              {/* Omdøb-tilstand: vis inputfelt i stedet for titlen */}
              {renamingId === c.id ? (
                <input
                  className="rename-input"
                  value={renameValue}
                  autoFocus
                  onChange={e => setRenameValue(e.target.value)}
                  onBlur={() => confirmRename(c.id)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') confirmRename(c.id)
                    if (e.key === 'Escape') setRenamingId(null)
                  }}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                // Dobbeltklik på titlen for at omdøbe
                <span className="chat-title" onDoubleClick={e => { e.stopPropagation(); startRename(c) }}>
                  {c.title}
                </span>
              )}
              {/* Slet-knap — stopPropagation forhindrer at chatten også åbnes */}
              <button
                className="delete-btn"
                onClick={e => { e.stopPropagation(); deleteChat(c.id) }}
                title="Slet"
              >×</button>
            </div>
          ))}
        </nav>
      </aside>

      {/* Hoved chat-område */}
      <main className="chat-area">
        {/* Topbar med hamburger-menu på mobil */}
        <div className="topbar">
          <button className="hamburger" onClick={() => setSidebarOpen(o => !o)}>☰</button>
          <span className="topbar-title">{activeChat.title}</span>
        </div>

        <div className="messages">
          {/* Velkomstskærm når chatten er tom */}
          {activeChat?.messages.length === 0 && (
            <div className="empty-state">
              <h2>Hvad kan jeg hjælpe dig med?</h2>
              <p>Skriv en besked for at starte</p>
            </div>
          )}
          {/* Viser alle beskeder i den aktive chat */}
          {activeChat?.messages.map((msg, i) => (
            <div key={i} className={`message ${msg.role}`}>
              <div className="bubble">
                {msg.role === 'assistant' ? (
                  // Renderer markdown i AI's svar (fed, lister, kode osv.)
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.text}
                  </ReactMarkdown>
                ) : (
                  msg.text
                )}
              </div>
            </div>
          ))}
          {/* Animeret loading-indikator mens AI svarer */}
          {loading && (
            <div className="message assistant">
              <div className="bubble typing">
                <span /><span /><span />
              </div>
            </div>
          )}
          {/* Usynligt element vi scroller ned til */}
          <div ref={bottomRef} />
        </div>

        {/* Inputfelt og send-knap */}
        <div className="input-area">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Skriv en besked..."
            rows={1}
            disabled={loading}
          />
          <button onClick={sendMessage} disabled={loading || !input.trim()}>
            Send
          </button>
        </div>
      </main>
    </div>
  )
}
