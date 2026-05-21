import { useMemo, useState, useEffect, useRef } from 'react'
import JSZip from 'jszip'
import axios from 'axios'
import {
  AlertTriangle,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  Database,
  Download,
  Files,
  FolderOpen,
  FolderTree,
  Image,
  LayoutDashboard,
  ShieldCheck,
  Star,
  Video,
  ChevronUp,
  ChevronDown,
  Send,
  Loader,
  X,
} from 'lucide-react'
import './index.css'
import InputSection from './components/InputSection'
import s0ucipherAvatar from './assets/s0ucipher_avatar.png'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

const categoryIcons = {
  Study: BookOpen,
  Photos: Image,
  PDFs: Files,
  Documents: Files,
  Videos: Video,
  Audio: Database,
  Archives: Database,
  Code: Database,
  Others: Database,
}

function App() {
  const [loading, setLoading] = useState(false)
  const [choosingAction, setChoosingAction] = useState('')
  const [savingAction, setSavingAction] = useState('')
  const [saveResult, setSaveResult] = useState(null)
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)
  const [envMode, setEnvMode] = useState('local')
  const [sources, setSources] = useState([])
  
  // Theme and Sorting state
  const [theme, setTheme] = useState(() => localStorage.getItem('neurosort-theme') || 'light')
  const [sortBy, setSortBy] = useState('name')

  // Modals state
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

  // Settings preferences state
  const [prefRenameSuggestions, setPrefRenameSuggestions] = useState(() => localStorage.getItem('pref-rename') !== 'false')
  const [prefShowConfidence, setPrefShowConfidence] = useState(() => localStorage.getItem('pref-confidence') !== 'false')
  const [prefShowSize, setPrefShowSize] = useState(() => localStorage.getItem('pref-size') !== 'false')
  const [customApiKey, setCustomApiKey] = useState(() => localStorage.getItem('pref-apikey') || '')

  // Interactive s0ucipher Chat State
  const [chatOpen, setChatOpen] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState([
    {
      sender: 'assistant',
      text: 'Greetings! I am s0ucipher, your AI file organizer. How can I help you analyze, prioritize, or reorganize your files today?'
    }
  ])
  const [chatLoading, setChatLoading] = useState(false)

  const chatEndRef = useRef(null)

  // Sync theme
  useEffect(() => {
    if (theme === 'dark') {
      document.body.classList.add('dark-theme')
    } else {
      document.body.classList.remove('dark-theme')
    }
    localStorage.setItem('neurosort-theme', theme)
  }, [theme])

  // Sync settings preferences
  useEffect(() => {
    localStorage.setItem('pref-rename', prefRenameSuggestions)
  }, [prefRenameSuggestions])

  useEffect(() => {
    localStorage.setItem('pref-confidence', prefShowConfidence)
  }, [prefShowConfidence])

  useEffect(() => {
    localStorage.setItem('pref-size', prefShowSize)
  }, [prefShowSize])

  useEffect(() => {
    localStorage.setItem('pref-apikey', customApiKey)
  }, [customApiKey])

  const handleToggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light')

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/api/config`)
        if (response.data?.envMode) {
          setEnvMode(response.data.envMode)
        }
      } catch (err) {
        console.error('Could not fetch environment configuration', err)
      }
    }
    fetchConfig()
  }, [])

  // Auto-scroll chat body
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, chatLoading])

  const isCancelMessage = (message) => message.toLowerCase().includes('cancel')

  const requestSelection = async (endpoint, responseKey, actionName, fallbackMessage) => {
    setChoosingAction(actionName)
    setError(null)

    try {
      const response = await axios.get(`${API_BASE_URL}${endpoint}`)
      return response.data[responseKey] || (responseKey === 'paths' ? [] : '')
    } catch (err) {
      const message = err.response?.data?.error || fallbackMessage
      if (!isCancelMessage(message)) {
        setError(message)
      }
      return responseKey === 'paths' ? [] : ''
    } finally {
      setChoosingAction('')
    }
  }

  const handleChooseFiles = () => requestSelection(
    '/api/select-files',
    'paths',
    'files',
    'Could not open the file picker. Make sure the Flask backend is running.',
  )

  const handleChooseFolders = () => requestSelection(
    '/api/select-folders',
    'paths',
    'folders',
    'Could not open the folder picker. Make sure the Flask backend is running.',
  )

  const handleChooseDestination = () => requestSelection(
    '/api/select-destination',
    'path',
    'destination',
    'Could not open the destination picker. Make sure the Flask backend is running.',
  )

  const handleOrganize = async ({ sources: inputSources, destinationPath, sortBy, applyChanges }) => {
    if (!inputSources.length) return

    setLoading(true)
    setError(null)
    setSaveResult(null)
    setResults(null)
    setSources(inputSources)

    try {
      let payload = {}
      if (envMode === 'web') {
        payload = {
          files_metadata: inputSources.map((file) => ({
            name: file.name,
            size_bytes: file.size,
            lastModified: file.lastModified,
            path: file.webkitRelativePath || file.name,
          })),
          sortBy,
        }
      } else {
        payload = {
          sources: inputSources,
          destinationPath,
          sortBy,
          applyChanges,
        }
      }

      const response = await axios.post(`${API_BASE_URL}/api/organize`, payload)
      setResults(response.data)

      // Auto open chat drawer when workspace is organized
      setChatOpen(true)
      setChatMessages(prev => [
        ...prev,
        {
          sender: 'assistant',
          text: `Scan complete! I found ${response.data?.dashboard?.total_files || 0} files. I categorized them and flagged important items for you. What would you like to ask me about this workspace?`
        }
      ])
    } catch (err) {
      console.error(err)
      setError(err.response?.data?.error || 'Failed to connect to the Flask backend. Start it on port 5055 and try again.')
    } finally {
      setLoading(false)
    }
  }

  const saveOrganized = async ({ data, destinationPath = '', saveMode, actionName }) => {
    setSavingAction(actionName)
    setError(null)
    setSaveResult(null)

    try {
      const response = await axios.post(`${API_BASE_URL}/api/save-organized`, {
        sources: data.sources || [],
        sortBy: data.sort_by || 'name',
        destinationPath,
        saveMode,
      })
      setSaveResult(response.data)
    } catch (err) {
      console.error(err)
      setError(err.response?.data?.error || 'Could not save the organized output.')
    } finally {
      setSavingAction('')
    }
  }

  const handleSaveToDownloadsWebMode = async (resultsData) => {
    setSavingAction('downloads')
    setError(null)
    setSaveResult(null)

    try {
      const zip = new JSZip()
      for (const record of resultsData.before || []) {
        const matchedFile = sources.find((file) => {
          const path = file.webkitRelativePath || file.name
          return path === record.source || file.name === record.name
        })

        if (matchedFile) {
          const folderName = record.folder || 'Others'
          let fileName = record.name
          let zipFilePath = `${folderName}/${fileName}`
          let base = fileName
          let ext = ''
          const lastDot = fileName.lastIndexOf('.')
          if (lastDot !== -1) {
            base = fileName.substring(0, lastDot)
            ext = fileName.substring(lastDot)
          }

          let counter = 1
          while (zip.file(zipFilePath)) {
            zipFilePath = `${folderName}/${base} (${counter})${ext}`
            counter++
          }
          zip.file(zipFilePath, matchedFile)
        }
      }

      const content = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(content)
      const link = document.createElement('a')
      link.href = url
      link.download = `NeuroSort_Organized_${new Date().toISOString().slice(0, 10)}.zip`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      setSaveResult({
        assistant_message: `s0ucipher successfully compiled and downloaded ${resultsData.before?.length || 0} file(s).`,
        export_path: 'Downloaded directly as ZIP via browser.',
      })
    } catch (err) {
      console.error(err)
      setError('Could not compile and download the ZIP file.')
    } finally {
      setSavingAction('')
    }
  }

  const handleSaveToDownloads = (data) => {
    if (envMode === 'web') {
      return handleSaveToDownloadsWebMode(data)
    }
    return saveOrganized({
      data,
      saveMode: 'downloads',
      actionName: 'downloads',
    })
  }

  const handleSaveToChosenLocation = async (data) => {
    const destinationPath = await handleChooseDestination()
    if (!destinationPath) return

    await saveOrganized({
      data,
      destinationPath,
      saveMode: 'custom',
      actionName: 'custom',
    })
  }

  // Handle s0ucipher Chat
  const handleSendChatMessage = async (e) => {
    e.preventDefault()
    if (!chatInput.trim()) return

    const userMsg = chatInput.trim()
    setChatMessages(prev => [...prev, { sender: 'user', text: userMsg }])
    setChatInput('')
    setChatLoading(true)

    try {
      let payload = {
        message: userMsg,
      }

      if (customApiKey) {
        payload.api_key = customApiKey
      }

      if (results) {
        if (envMode === 'web') {
          payload.files_metadata = results.before || []
        } else {
          payload.sources = results.sources || []
        }
      }

      const response = await axios.post(`${API_BASE_URL}/api/chat`, payload)
      setChatMessages(prev => [...prev, { sender: 'assistant', text: response.data.response }])
    } catch (err) {
      console.error(err)
      setChatMessages(prev => [
        ...prev,
        { sender: 'assistant', text: "Apologies, I encountered an issue connecting to my neural network. Please check that the Flask server is running." }
      ])
    } finally {
      setChatLoading(false)
    }
  }

  const workspacePath = useMemo(() => {
    if (results?.sources?.length) {
      return results.sources[0]
    }
    if (sources?.length) {
      const first = sources[0]
      return typeof first === 'string' ? first : (first.webkitRelativePath || first.name)
    }
    return 'No Workspace Scanned'
  }, [results, sources])

  return (
    <main className="app-shell">
      {/* Redesigned Sidebar Container */}
      <InputSection
        onChooseDestination={handleChooseDestination}
        onChooseFiles={handleChooseFiles}
        onChooseFolders={handleChooseFolders}
        onSubmit={handleOrganize}
        choosingAction={choosingAction}
        loading={loading}
        envMode={envMode}
        sortBy={sortBy}
        onSortByChange={setSortBy}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenHelp={() => setHelpOpen(true)}
      />

      {/* Right Dashboard Area */}
      <div className="main-content">
        {/* Error Notification Alert */}
        {error && (
          <div className="status-panel error-panel" style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '12px', padding: '14px 20px', color: '#b91c1c', fontSize: '13px' }}>
            <AlertTriangle size={20} />
            <p>{error}</p>
          </div>
        )}

        {results ? (
          <ResultsView
            data={results}
            envMode={envMode}
            onSaveToChosenLocation={handleSaveToChosenLocation}
            onSaveToDownloads={handleSaveToDownloads}
            saveResult={saveResult}
            savingAction={savingAction}
            workspacePath={workspacePath}
            loading={loading}
            sortBy={sortBy}
            prefShowConfidence={prefShowConfidence}
            prefRenameSuggestions={prefRenameSuggestions}
            prefShowSize={prefShowSize}
          />
        ) : (
          <EmptyState />
        )}
      </div>

      {/* Floating Interactive Chat Drawer */}
      <div className={`s0ucipher-chat-drawer ${chatOpen ? '' : 'collapsed'}`}>
        <div className="chat-header" onClick={() => setChatOpen(!chatOpen)}>
          <div className="chat-header-left">
            <img className="chat-header-avatar" src={s0ucipherAvatar} alt="s0ucipher avatar" />
            <span className="chat-header-title">s0ucipher AI Chat</span>
            <span className="chat-header-badge" />
          </div>
          {chatOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </div>

        {chatOpen && (
          <>
            <div className="chat-body">
              {chatMessages.map((msg, index) => (
                <div key={index} className={`chat-message-bubble ${msg.sender}`}>
                  {msg.text}
                </div>
              ))}
              {chatLoading && (
                <div className="chat-message-bubble assistant" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Loader size={14} className="spinner" style={{ borderColor: 'rgba(0,0,0,0.1)', borderTopColor: '#3b82f6' }} />
                  <span>s0ucipher is thinking...</span>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <form className="chat-footer" onSubmit={handleSendChatMessage}>
              <input
                type="text"
                className="chat-input-box"
                placeholder="Ask s0ucipher about these files..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                disabled={chatLoading}
              />
              <button type="submit" className="chat-send-btn" disabled={chatLoading || !chatInput.trim()}>
                <Send size={16} />
              </button>
            </form>
          </>
        )}
      </div>

      {/* Settings Modal */}
      {settingsOpen && (
        <div className="modal-overlay" onClick={() => setSettingsOpen(false)}>
          <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Settings Configuration</h2>
              <button className="modal-close-btn" onClick={() => setSettingsOpen(false)}>
                <X size={20} />
              </button>
            </div>
            
            <div className="modal-body">
              <div className="setting-control-group">
                <label className="setting-toggle-row">
                  <input
                    type="checkbox"
                    checked={prefRenameSuggestions}
                    onChange={(e) => setPrefRenameSuggestions(e.target.checked)}
                  />
                  <div>
                    <strong>Auto-Rename Suggestions</strong>
                    <span>Display AI suggested file names in the preview panel</span>
                  </div>
                </label>
              </div>

              <div className="setting-control-group">
                <label className="setting-toggle-row">
                  <input
                    type="checkbox"
                    checked={prefShowConfidence}
                    onChange={(e) => setPrefShowConfidence(e.target.checked)}
                  />
                  <div>
                    <strong>Show AI Confidence</strong>
                    <span>Display match confidence percentages for file tagging</span>
                  </div>
                </label>
              </div>

              <div className="setting-control-group">
                <label className="setting-toggle-row">
                  <input
                    type="checkbox"
                    checked={prefShowSize}
                    onChange={(e) => setPrefShowSize(e.target.checked)}
                  />
                  <div>
                    <strong>Show File Sizes</strong>
                    <span>Display parsed size bytes column in results preview</span>
                  </div>
                </label>
              </div>

              <hr className="modal-divider" />

              <div className="setting-input-group">
                <label>
                  <strong>Custom Google Gemini API Key</strong>
                  <span className="input-sublabel">Enable direct AI agent chat queries from your browser. Key is stored securely in your local browser storage.</span>
                  <input
                    type="password"
                    className="modal-text-input"
                    placeholder="AIzaSy..."
                    value={customApiKey}
                    onChange={(e) => setCustomApiKey(e.target.value)}
                  />
                </label>
                {customApiKey && (
                  <button className="clear-api-key-btn" onClick={() => setCustomApiKey('')}>
                    Clear Saved Key
                  </button>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button className="modal-save-btn" onClick={() => setSettingsOpen(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Help / About Developer Modal */}
      {helpOpen && (
        <div className="modal-overlay" onClick={() => setHelpOpen(false)}>
          <div className="modal-content glass-card about-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>About NeuroSort AI & Developer</h2>
              <button className="modal-close-btn" onClick={() => setHelpOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              <div className="about-section">
                <div className="developer-profile">
                  <div className="dev-avatar-glow">S</div>
                  <div className="dev-meta">
                    <h3>Sougata Poddar</h3>
                    <span className="dev-handle">@s0ucipher</span>
                    <span className="dev-title">Systems & AI Architect</span>
                  </div>
                </div>
                <p className="developer-bio">
                  Greetings! I am Sougata Poddar, a software developer and AI engineer passionate about building high-performance, local-first applications. I created <strong>NeuroSort AI</strong> to solve the universal pain point of cluttered downloads, desktop directories, and unorganized file structures, while maintaining absolute data privacy.
                </p>
              </div>

              <hr className="modal-divider" />

              <div className="about-section">
                <h3>How I Built NeuroSort AI</h3>
                <p className="architecture-text">
                  NeuroSort AI is built as a hybrid desktop utility that marries premium glassmorphic UI design with a robust, high-performance local system runner:
                </p>
                <ul className="architecture-list">
                  <li>
                    <strong>Glassy React Frontend:</strong> A fast, responsive desktop-like layout that recursively reads files and folder directories locally.
                  </li>
                  <li>
                    <strong>Local Flask Hub:</strong> A lightweight python local server running on port <code>5055</code> to securely read, write, move, and copy organized structures without latency.
                  </li>
                  <li>
                    <strong>Smart Priority Engine:</strong> Heuristic filters inspect name tokens for study tags (triggering study classification) and high-priority keywords (like <code>exam</code>, <code>urgent</code>, or <code>deadline</code>) to assign priority ranks.
                  </li>
                  <li>
                    <strong>Agent Integrations:</strong> A chat interface allows direct queries to <strong>s0ucipher</strong>, which can be connected to the Google Gemini API to analyze files intelligently.
                  </li>
                </ul>
              </div>
            </div>

            <div className="modal-footer">
              <button className="modal-save-btn" onClick={() => setHelpOpen(false)}>
                Close Briefing
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function EmptyState() {
  return (
    <div className="dashboard-welcome-stage">
      <div className="welcome-graphic-box">
        <BrainCircuit size={40} />
      </div>
      <h2>Welcome to NeuroSort AI</h2>
      <p>
        I am s0ucipher, your smart AI agent. Add files, directories, or both in the left sidebar, select a save location, and click <strong>Organize Batch</strong>. I will organize them and break down their priorities in real-time.
      </p>
    </div>
  )
}

function ResultsView({
  data,
  envMode,
  onSaveToChosenLocation,
  onSaveToDownloads,
  saveResult,
  savingAction,
  workspacePath,
  loading,
  sortBy,
  prefShowConfidence,
  prefRenameSuggestions,
  prefShowSize,
}) {
  const formatSize = (bytes) => {
    if (!bytes) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  const formatDate = (isoStr) => {
    if (!isoStr) return ''
    try {
      const d = new Date(isoStr)
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    } catch {
      return isoStr
    }
  }

  // Client-side sorting logic
  const sortedBeforeList = useMemo(() => {
    const list = [...(data.before || [])]
    if (sortBy === 'type') {
      return list.sort((a, b) => {
        const typeCompare = (a.type || '').localeCompare(b.type || '')
        if (typeCompare !== 0) return typeCompare
        return (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' })
      })
    } else if (sortBy === 'size-desc') {
      return list.sort((a, b) => (b.size_bytes || 0) - (a.size_bytes || 0))
    } else if (sortBy === 'size-asc') {
      return list.sort((a, b) => (a.size_bytes || 0) - (b.size_bytes || 0))
    } else if (sortBy === 'priority') {
      const priorityWeight = { High: 3, Medium: 2, Low: 1 }
      return list.sort((a, b) => {
        const weightCompare = (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0)
        if (weightCompare !== 0) return weightCompare
        return (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' })
      })
    } else {
      // Default: name (alphabetical and by number)
      return list.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }))
    }
  }, [data.before, sortBy])

  // Compute category counts
  const categoryCounts = useMemo(() => {
    const list = data.before || []
    const counts = {
      Photos: 0,
      Videos: 0,
      PDFs: 0,
      Study: 0,
      Others: 0,
    }
    list.forEach(item => {
      const cat = item.category
      if (cat === 'Photos') counts.Photos++
      else if (cat === 'Videos') counts.Videos++
      else if (cat === 'PDFs') counts.PDFs++
      else if (cat === 'Study') counts.Study++
      else counts.Others++
    })
    return counts
  }, [data.before])

  // Compute priority breakdown
  const priorityStats = useMemo(() => {
    const list = data.before || []
    let importantCount = 0
    let importantSize = 0
    let calmerCount = 0
    let calmerSize = 0

    list.forEach(item => {
      const size = item.size_bytes || 0
      if (item.priority === 'High') {
        importantCount++
        importantSize += size
      } else {
        calmerCount++
        calmerSize += size
      }
    })

    const total = list.length || 1
    const importantPercent = Math.round((importantCount / total) * 100)
    const calmerPercent = Math.round((calmerCount / total) * 100)

    return {
      importantCount,
      importantSize,
      importantPercent,
      calmerCount,
      calmerSize,
      calmerPercent,
    }
  }, [data.before])

  const totalSizeStr = useMemo(() => {
    const totalBytes = (data.before || []).reduce((sum, item) => sum + (item.size_bytes || 0), 0)
    return formatSize(totalBytes)
  }, [data.before])

  return (
    <>
      {/* Top Workspace Header */}
      <div className="dashboard-header">
        <div className="workspace-info">
          <div className="workspace-icon-box">
            <FolderOpen size={20} />
          </div>
          <div className="workspace-text-block">
            <strong>Scanner Workspace</strong>
            <span>{workspacePath}</span>
          </div>
        </div>

        <div className="header-status-controls">
          <div className={`status-badge ${loading ? 'scanning' : 'completed'}`}>
            <span className="status-dot" />
            <span>{loading ? 'Scanning...' : 'Scanning completed'}</span>
          </div>
        </div>
      </div>

      {/* Row 1: s0ucipher Profile & Live Analysis Checklist */}
      <div className="dashboard-grid-row-1">
        <div className="agent-card">
          <div className="agent-profile-header">
            <img className="agent-avatar-circle" src={s0ucipherAvatar} alt="s0ucipher AI Avatar" />
            <div className="agent-profile-identity">
              <div className="agent-name-row">
                <span className="agent-name">s0ucipher</span>
                <span className="agent-tag">AI Agent</span>
              </div>
              <span className="agent-subtext">Analyzing, understanding and organizing your files intelligently.</span>
            </div>
          </div>

          <div className="agent-stats-strip">
            <div className="agent-stat-box">
              <span className="stat-label">Files Found</span>
              <span className="stat-value">{data.dashboard?.total_files || 0}</span>
            </div>
            <div className="agent-stat-box">
              <span className="stat-label">Folders</span>
              <span className="stat-value">{data.dashboard?.total_categories || 0}</span>
            </div>
            <div className="agent-stat-box">
              <span className="stat-label">Size</span>
              <span className="stat-value">{totalSizeStr}</span>
            </div>
            <div className="agent-stat-box">
              <span className="stat-label">Safety</span>
              <span className="stat-value">Local</span>
            </div>
          </div>
        </div>

        <div className="live-analysis-card">
          <div>
            <div className="live-analysis-header">
              <BrainCircuit size={18} />
              <strong>Live Analysis</strong>
            </div>
            <span className="live-analysis-subtitle">Reading file types, contents and context...</span>
          </div>

          <div className="live-analysis-progress-container">
            <div className="live-progress-bar-track">
              <div className="live-progress-bar-fill" style={{ width: '100%' }} />
            </div>
            <span className="live-progress-text">100% Complete</span>
          </div>

          <div className="live-analysis-checklist">
            <div className="checklist-item checked">
              <CheckCircle2 size={14} className="checklist-icon" />
              <span>Scanning files</span>
            </div>
            <div className="checklist-item checked">
              <CheckCircle2 size={14} className="checklist-icon" />
              <span>Understanding file types</span>
            </div>
            <div className="checklist-item checked">
              <CheckCircle2 size={14} className="checklist-icon" />
              <span>Analyzing importance</span>
            </div>
            <div className="checklist-item checked">
              <CheckCircle2 size={14} className="checklist-icon" />
              <span>Organizing folders</span>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Categories Section */}
      <div className="section-title-row">
        <span className="section-title">Categories</span>
        <a href="#results" className="section-link">View All</a>
      </div>

      <div className="categories-card-grid">
        <CategoryCard name="Photos" count={categoryCounts.Photos} label="Images" className="cat-photos" />
        <CategoryCard name="Videos" count={categoryCounts.Videos} label="Files" className="cat-videos" />
        <CategoryCard name="PDFs" count={categoryCounts.PDFs} label="Documents" className="cat-pdfs" />
        <CategoryCard name="Study Hub" count={categoryCounts.Study} label="Study Files" className="cat-study" />
        <CategoryCard name="Others" count={categoryCounts.Others} label="Files" className="cat-others" />
      </div>

      {/* Row 3: Priority Analysis Block */}
      <div className="priority-analysis-container">
        <div className="priority-header-block">
          <strong>Priority Analysis</strong>
          <span>s0ucipher evaluates importance based on content, recency and relevance.</span>
        </div>

        <div className="priority-cards-grid">
          <div className="priority-dashboard-card important">
            <div className="priority-card-left">
              <div className="priority-card-icon-box-round">
                <Star size={18} />
              </div>
              <div className="priority-card-text-block">
                <strong>Important (High Priority)</strong>
                <span>{priorityStats.importantCount} files • {formatSize(priorityStats.importantSize)}</span>
              </div>
            </div>
            <span className="priority-card-percentage-val">{priorityStats.importantPercent}%</span>
          </div>

          <div className="priority-dashboard-card less-important">
            <div className="priority-card-left">
              <div className="priority-card-icon-box-round">
                <CheckCircle2 size={18} />
              </div>
              <div className="priority-card-text-block">
                <strong>Less Important (Low Priority)</strong>
                <span>{priorityStats.calmerCount} files • {formatSize(priorityStats.calmerSize)}</span>
              </div>
            </div>
            <span className="priority-card-percentage-val">{priorityStats.calmerPercent}%</span>
          </div>
        </div>
      </div>

      {/* Row 4: Results Preview Section */}
      <div id="results" className="results-preview-container">
        <div className="results-header-block">
          <strong>Results Preview ({sortedBeforeList.length} Items)</strong>
        </div>

        <div className="results-table-wrapper">
          <table className="results-table">
            <thead>
              <tr>
                <th>Name</th>
                {prefRenameSuggestions && <th>Suggested Name</th>}
                <th>Category</th>
                {prefShowConfidence && <th>Confidence</th>}
                <th>Importance</th>
                {prefShowSize && <th>Size</th>}
                <th>Date Modified</th>
              </tr>
            </thead>
            <tbody>
              {sortedBeforeList.map((file, idx) => (
                <tr key={idx}>
                  <td className="file-name-cell">{file.name}</td>
                  {prefRenameSuggestions && <td className="file-suggested-name-cell" style={{ color: '#8b5cf6', fontStyle: 'italic', fontWeight: '500' }}>{file.suggested_name}</td>}
                  <td>
                    <span className={`badge-pill cat-${(file.category || 'others').toLowerCase()}`}>
                      {file.category}
                    </span>
                  </td>
                  {prefShowConfidence && (
                    <td>
                      <span className="confidence-text-score" style={{ fontWeight: '600', color: '#10b981' }}>
                        {Math.round((file.confidence || 0) * 100)}%
                      </span>
                    </td>
                  )}
                  <td>
                    <span className={`badge-pill importance-${(file.priority || 'low').toLowerCase()}`}>
                      {file.priority}
                    </span>
                  </td>
                  {prefShowSize && <td>{formatSize(file.size_bytes)}</td>}
                  <td>{formatDate(file.modified_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Row 5: Save Organized Export Option box */}
      <div className="results-export-actions-row">
        <div className="results-export-text">
          <strong>Save Organized Results</strong>
          <span>Ready to save your clean reorganized structure? Click below to save copy.</span>
        </div>

        <div className="results-export-buttons">
          <button
            className="export-btn-downloads"
            disabled={Boolean(savingAction)}
            onClick={() => onSaveToDownloads(data)}
          >
            {savingAction === 'downloads' ? <span className="spinner" /> : <Download size={16} />}
            Save to Downloads
          </button>

          {envMode !== 'web' && (
            <button
              className="export-btn-custom"
              disabled={Boolean(savingAction)}
              onClick={() => onSaveToChosenLocation(data)}
            >
              {savingAction === 'custom' ? <span className="spinner" /> : <FolderOpen size={16} />}
              Choose Save Location
            </button>
          )}
        </div>
      </div>

      {/* Save Success Alert banner */}
      {saveResult && (
        <div className="export-result-success-box">
          <CheckCircle2 size={18} />
          <div>
            <strong>{saveResult.assistant_message}</strong>
            <span style={{ display: 'block', marginTop: '2px', fontSize: '11px' }}>
              Target folder: {saveResult.export_path}
            </span>
          </div>
        </div>
      )}
    </>
  )
}

function CategoryCard({ name, count, label, className }) {
  const Icon = categoryIcons[name] || categoryIcons.Others
  const percent = count > 0 ? Math.min(100, Math.max(10, count * 5)) : 0

  return (
    <div className={`category-dashboard-card ${className}`}>
      <div className="category-card-icon-row">
        <div className="category-card-icon-box">
          <Icon size={18} />
        </div>
      </div>
      <div className="category-card-text">
        <span className="category-card-name">{name}</span>
        <div className="category-card-stats">
          <span className="category-card-count">{count}</span>
          <span className="category-card-label">{label}</span>
        </div>
      </div>
      <div className="category-card-indicator-line">
        <div className="category-card-indicator-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

export default App
