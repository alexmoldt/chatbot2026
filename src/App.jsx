import { useState, useRef, useEffect } from 'react'
import './App.css'

const API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const API_KEY = import.meta.env.VITE_GROQ_API_KEY

function createNewChat() {
  return { id: Date.now(), title: 'Ny chat', messages: [] }
}

export default function App() {
  const [chats, setChats] = useState([createNewChat()])
  const [activeChatId, setActiveChatId] = useState(chats[0].id)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)

  const activeChat = chats.find(c => c.id === activeChatId)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeChat?.messages])

  function updateChat(id, updater) {
    setChats(prev => prev.map(c => c.id === id ? updater(c) : c))
  }

  async function sendMessage() {
    const text = input.trim()
    if (!text || loading) return

    const userMsg = { role: 'user', text }
    setInput('')
    setLoading(true)

    updateChat(activeChatId, c => ({
      ...c,
      title: c.messages.length === 0 ? text.slice(0, 30) : c.title,
      messages: [...c.messages, userMsg]
    }))

    try {
      const history = activeChat.messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.text
      }))

      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: 'Du er en hjælpsom assistent. Svar altid på dansk, uanset hvilket sprog brugeren skriver på.' },
            ...history,
            { role: 'user', content: text }
          ]
        })
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(`Fejl ${res.status}: ${data.error?.message ?? 'Ukendt fejl'}`)
      }
      const reply = data.choices?.[0]?.message?.content ?? 'Ingen svar modtaget.'

      updateChat(activeChatId, c => ({
        ...c,
        messages: [...c.messages, { role: 'assistant', text: reply }]
      }))
    } catch (err) {
      updateChat(activeChatId, c => ({
        ...c,
        messages: [...c.messages, { role: 'assistant', text: err.message || 'Der opstod en fejl. Prøv igen.' }]
      }))
    } finally {
      setLoading(false)
    }
  }

  function newChat() {
    const chat = createNewChat()
    setChats(prev => [chat, ...prev])
    setActiveChatId(chat.id)
  }

  function deleteChat(id) {
    setChats(prev => {
      const remaining = prev.filter(c => c.id !== id)
      if (remaining.length === 0) {
        const fresh = createNewChat()
        setActiveChatId(fresh.id)
        return [fresh]
      }
      if (id === activeChatId) setActiveChatId(remaining[0].id)
      return remaining
    })
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <span className="logo">ChatBot</span>
          <button className="new-chat-btn" onClick={newChat} title="Ny chat">+</button>
        </div>
        <nav className="chat-list">
          {chats.map(c => (
            <div
              key={c.id}
              className={`chat-item ${c.id === activeChatId ? 'active' : ''}`}
              onClick={() => setActiveChatId(c.id)}
            >
              <span className="chat-title">{c.title}</span>
              <button
                className="delete-btn"
                onClick={e => { e.stopPropagation(); deleteChat(c.id) }}
                title="Slet"
              >×</button>
            </div>
          ))}
        </nav>
      </aside>

      <main className="chat-area">
        <div className="messages">
          {activeChat?.messages.length === 0 && (
            <div className="empty-state">
              <h2>Hvad kan jeg hjælpe dig med?</h2>
              <p>Skriv en besked for at starte</p>
            </div>
          )}
          {activeChat?.messages.map((msg, i) => (
            <div key={i} className={`message ${msg.role}`}>
              <div className="bubble">{msg.text}</div>
            </div>
          ))}
          {loading && (
            <div className="message assistant">
              <div className="bubble typing">
                <span /><span /><span />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

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
