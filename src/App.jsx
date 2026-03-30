import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneLight, oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
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
  // true mens vi venter på / streamer svar fra AI
  const [loading, setLoading] = useState(false)
  // ID på den chat der er ved at blive omdøbt (null = ingen)
  const [renamingId, setRenamingId] = useState(null)
  // Teksten i omdøb-feltet
  const [renameValue, setRenameValue] = useState('')
  // true når sidebjælken er åben på mobil
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // Mørkt eller lyst tema
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('theme') === 'dark')
  // Bruges til at scrolle ned til den nyeste besked automatisk
  const bottomRef = useRef(null)

  // Sætter tema-klasse på <html> elementet og gemmer valget
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
    localStorage.setItem('theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  // Gemmer chats i localStorage hver gang de ændrer sig
  useEffect(() => {
    localStorage.setItem('chats', JSON.stringify(chats))
  }, [chats])

  // Scroller ned til bunden hver gang der kommer nyt indhold
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chats, activeChatId])

  // Finder den aktive chat ud fra id
  const activeChat = chats.find(c => c.id === activeChatId) ?? chats[0]

  // Opdaterer en specifik chat ved hjælp af en updater-funktion
  function updateChat(id, updater) {
    setChats(prev => prev.map(c => c.id === id ? updater(c) : c))
  }

  // Sender brugerens besked og streamer svar fra AI
  async function sendMessage() {
    const text = input.trim()
    if (!text || loading) return

    const userMsg = { role: 'user', text }
    setInput('')
    setLoading(true)
    setSidebarOpen(false)

    // Tilføjer brugerens besked og en tom AI-besked som vi fylder ud under streaming
    const currentChatId = activeChat.id
    updateChat(currentChatId, c => ({
      ...c,
      title: c.messages.length === 0 ? text.slice(0, 30) : c.title,
      messages: [...c.messages, userMsg, { role: 'assistant', text: '' }]
    }))

    try {
      // Bygger samtalehistorikken i det format Groq forventer
      const history = activeChat.messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.text
      }))

      // Sender anmodning til Groq API med streaming aktiveret
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          stream: true, // Aktiverer streaming — svar kommer løbende
          messages: [
            { role: 'system', content: 'Du er en hjælpsom assistent. Svar altid på dansk, uanset hvilket sprog brugeren skriver på.' },
            ...history,
            { role: 'user', content: text }
          ]
        })
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(`Fejl ${res.status}: ${data.error?.message ?? 'Ukendt fejl'}`)
      }

      // Læser den løbende datastrøm fra API'et
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let fullReply = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        // Dekoder den binære chunk til tekst
        const chunk = decoder.decode(value, { stream: true })

        // Groq sender data som "data: {...}\n\n" linjer (SSE format)
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '))

        for (const line of lines) {
          const json = line.replace('data: ', '')
          if (json === '[DONE]') break // Streaming er færdig

          try {
            const parsed = JSON.parse(json)
            // Udtrækker det nye stykke tekst fra svaret
            const delta = parsed.choices?.[0]?.delta?.content ?? ''
            if (delta) {
              fullReply += delta
              // Opdaterer AI's besked løbende mens teksten streamer ind
              updateChat(currentChatId, c => {
                const msgs = [...c.messages]
                msgs[msgs.length - 1] = { role: 'assistant', text: fullReply }
                return { ...c, messages: msgs }
              })
            }
          } catch {}
        }
      }
    } catch (err) {
      // Viser fejlbeskeden i den tomme AI-besked
      updateChat(currentChatId, c => {
        const msgs = [...c.messages]
        msgs[msgs.length - 1] = { role: 'assistant', text: err.message || 'Der opstod en fejl. Prøv igen.' }
        return { ...c, messages: msgs }
      })
    } finally {
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
      if (remaining.length === 0) {
        const fresh = createNewChat()
        setActiveChatId(fresh.id)
        return [fresh]
      }
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

  // Kopierer en besked til udklipsholderen
  async function copyMessage(text) {
    await navigator.clipboard.writeText(text)
  }

  // Sender beskeden når brugeren trykker Enter (men ikke Shift+Enter)
  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // Custom renderer til ReactMarkdown — viser kodeblokke med syntax highlighting
  const markdownComponents = {
    code({ node, inline, className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '')
      const language = match ? match[1] : 'text'
      const codeString = String(children).replace(/\n$/, '')

      if (!inline && match) {
        return (
          <div className="code-block">
            <div className="code-header">
              <span className="code-lang">{language}</span>
              {/* Kopier-knap til kodeblokke */}
              <button className="copy-code-btn" onClick={() => copyMessage(codeString)}>
                Kopiér
              </button>
            </div>
            <SyntaxHighlighter
              style={darkMode ? oneDark : oneLight}
              language={language}
              PreTag="div"
              {...props}
            >
              {codeString}
            </SyntaxHighlighter>
          </div>
        )
      }
      // Inline kode (fx `variabel`)
      return <code className={className} {...props}>{children}</code>
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
          <div className="header-actions">
            {/* Tema-skifte knap */}
            <button className="icon-btn" onClick={() => setDarkMode(d => !d)} title="Skift tema">
              {darkMode ? '☀️' : '🌙'}
            </button>
            {/* Knap til at starte en ny chat */}
            <button className="new-chat-btn" onClick={newChat} title="Ny chat">+</button>
          </div>
        </div>

        {/* Liste over alle chats */}
        <nav className="chat-list">
          {chats.map(c => (
            <div
              key={c.id}
              className={`chat-item ${c.id === activeChat.id ? 'active' : ''}`}
              onClick={() => { setActiveChatId(c.id); setSidebarOpen(false) }}
            >
              {renamingId === c.id ? (
                // Omdøb-tilstand: vis inputfelt
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
                // Dobbeltklik for at omdøbe
                <span className="chat-title" onDoubleClick={e => { e.stopPropagation(); startRename(c) }}>
                  {c.title}
                </span>
              )}
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
          <button className="icon-btn" onClick={() => setDarkMode(d => !d)} title="Skift tema">
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>

        <div className="messages">
          {/* Velkomstskærm når chatten er tom */}
          {activeChat?.messages.length === 0 && (
            <div className="empty-state">
              <h2>Hvad kan jeg hjælpe dig med?</h2>
              <p>Skriv en besked for at starte</p>
            </div>
          )}

          {/* Viser alle beskeder */}
          {activeChat?.messages.map((msg, i) => (
            <div key={i} className={`message ${msg.role}`}>
              <div className="bubble">
                {msg.role === 'assistant' ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {msg.text}
                  </ReactMarkdown>
                ) : (
                  msg.text
                )}
              </div>
              {/* Kopier-knap på beskeder */}
              {msg.text && (
                <button className="copy-msg-btn" onClick={() => copyMessage(msg.text)} title="Kopiér">
                  ⎘
                </button>
              )}
            </div>
          ))}

          {/* Blinkende cursor mens AI streamer */}
          {loading && activeChat?.messages[activeChat.messages.length - 1]?.text === '' && (
            <div className="message assistant">
              <div className="bubble typing">
                <span /><span /><span />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Inputfelt og send-knap */}
        <div className="input-area">
          <textarea
            value={input}
            onChange={e => {
              setInput(e.target.value)
              // Auto-resize: nulstil højde og sæt til scrollHeight
              e.target.style.height = 'auto'
              e.target.style.height = e.target.scrollHeight + 'px'
            }}
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
