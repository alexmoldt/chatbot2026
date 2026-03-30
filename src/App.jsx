import { useState, useRef, useEffect } from 'react'
import './App.css'

// Groq API endpoint og nøgle fra .env filen
const API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const API_KEY = import.meta.env.VITE_GROQ_API_KEY

// Opretter et nyt tomt chat-objekt med et unikt id baseret på tidsstempel
function createNewChat() {
  return { id: Date.now(), title: 'Ny chat', messages: [] }
}

export default function App() {
  // Liste over alle chats
  const [chats, setChats] = useState([createNewChat()])
  // ID på den chat der er åben lige nu
  const [activeChatId, setActiveChatId] = useState(chats[0].id)
  // Teksten brugeren skriver i inputfeltet
  const [input, setInput] = useState('')
  // true mens vi venter på svar fra AI
  const [loading, setLoading] = useState(false)
  // Bruges til at scrolle ned til den nyeste besked automatisk
  const bottomRef = useRef(null)

  // Finder den aktive chat ud fra id
  const activeChat = chats.find(c => c.id === activeChatId)

  // Scroller ned til bunden hver gang der kommer en ny besked
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeChat?.messages])

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

    // Tilføjer brugerens besked til chatten og sætter titlen på den første besked
    updateChat(activeChatId, c => ({
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
            ...history,               // Tidligere beskeder i samtalen
            { role: 'user', content: text } // Den nye besked fra brugeren
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
      updateChat(activeChatId, c => ({
        ...c,
        messages: [...c.messages, { role: 'assistant', text: reply }]
      }))
    } catch (err) {
      // Viser fejlbeskeden i chatten hvis noget gik galt
      updateChat(activeChatId, c => ({
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

  // Sender beskeden når brugeren trykker Enter (men ikke Shift+Enter)
  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="layout">
      {/* Sidebjælke med chat-historik */}
      <aside className="sidebar">
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
              className={`chat-item ${c.id === activeChatId ? 'active' : ''}`}
              onClick={() => setActiveChatId(c.id)}
            >
              <span className="chat-title">{c.title}</span>
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
              <div className="bubble">{msg.text}</div>
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
