import { createElement, useMemo, useState, useEffect } from 'react'
import JSZip from 'jszip'
import axios from 'axios'
import {
  AlertTriangle,
  Archive,
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
  ListFilter,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  Video,
  Zap,
} from 'lucide-react'
import './index.css'
import InputSection from './components/InputSection'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

const categoryIcons = {
  Study: BookOpen,
  Images: Image,
  Documents: Files,
  Videos: Video,
  Others: Archive,
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

  const handleOrganize = async ({ sources, destinationPath, sortBy, applyChanges }) => {
    if (!sources.length) return

    setLoading(true)
    setError(null)
    setSaveResult(null)
    setResults(null)
    setSources(sources)

    try {
      let payload = {}
      if (envMode === 'web') {
        payload = {
          files_metadata: sources.map((file) => ({
            name: file.name,
            size_bytes: file.size,
            lastModified: file.lastModified,
            path: file.webkitRelativePath || file.name,
          })),
          sortBy,
        }
      } else {
        payload = {
          sources,
          destinationPath,
          sortBy,
          applyChanges,
        }
      }

      const response = await axios.post(`${API_BASE_URL}/api/organize`, payload)

      setResults(response.data)
    } catch (err) {
      console.error(err)
      setError(err.response?.data?.error || 'Failed to connect to the Flask backend. Start it on port 5050 and try again.')
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
        assistant_message: `s0ucipher successfully zipped and downloaded ${resultsData.before?.length || 0} file(s).`,
        export_path: 'Downloaded directly via browser.',
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

  return (
    <main className="app-shell">
      <Hero />

      <InputSection
        onChooseDestination={handleChooseDestination}
        onChooseFiles={handleChooseFiles}
        onChooseFolders={handleChooseFolders}
        onSubmit={handleOrganize}
        choosingAction={choosingAction}
        loading={loading}
        envMode={envMode}
      />

      {error && (
        <div className="status-panel error-panel">
          <AlertTriangle size={20} />
          <p>{error}</p>
        </div>
      )}

      {results ? (
        <ResultsView
          data={results}
          sources={sources}
          envMode={envMode}
          onSaveToChosenLocation={handleSaveToChosenLocation}
          onSaveToDownloads={handleSaveToDownloads}
          saveResult={saveResult}
          savingAction={savingAction}
        />
      ) : <EmptyState />}
    </main>
  )
}

function Hero() {
  return (
    <section className="hero-stage">
      <div className="hero-copy-block">
        <p className="hero-badge"><Sparkles size={16} /> s0ucipher powered organizer</p>
        <h1>NeuroSort AI</h1>
        <p className="hero-copy">
          Add files + folders {'->'} s0ucipher AI rules {'->'} Batch sorting {'->'} Smart output + cleanup guidance
        </p>
        <div className="hero-chips" aria-label="Project highlights">
          <span><BrainCircuit size={16} /> s0ucipher AI</span>
          <span><ShieldCheck size={16} /> Duplicate guard</span>
          <span><Star size={16} /> Exam priority</span>
        </div>
      </div>

      <div className="hero-preview" aria-label="NeuroSort preview">
        <div className="preview-topbar">
          <span />
          <span />
          <span />
        </div>
        <div className="scan-card hot">
          <FilePreviewIcon icon={Files} />
          <div>
            <strong>final_exam.pdf</strong>
            <p>High Priority</p>
          </div>
          <Star size={18} />
        </div>
        <div className="scan-card cool">
          <FilePreviewIcon icon={BookOpen} />
          <div>
            <strong>math_notes.docx</strong>
            <p>Study Hub</p>
          </div>
          <BookOpen size={18} />
        </div>
        <div className="scan-card bright">
          <FilePreviewIcon icon={Image} />
          <div>
            <strong>project_photo.png</strong>
            <p>Images</p>
          </div>
          <Image size={18} />
        </div>
      </div>
    </section>
  )
}

function FilePreviewIcon({ icon: Icon }) {
  return (
    <span className="file-preview-icon">
      {createElement(Icon, { size: 20 })}
    </span>
  )
}

function EmptyState() {
  return (
    <section className="empty-state">
      <div className="empty-graphic">
        <LayoutDashboard size={34} />
        <span />
        <span />
        <span />
      </div>
      <div>
        <h2>Ready for mixed sources</h2>
        <p>Add folders, individual files, or both. s0ucipher will scan the batch and build the dashboard, before view, after view, and AI suggestions.</p>
      </div>
    </section>
  )
}

function ResultsView({ data, sources, envMode, onSaveToChosenLocation, onSaveToDownloads, saveResult, savingAction }) {
  const categoryEntries = useMemo(() => Object.entries(data.categories || {}), [data.categories])
  const afterEntries = useMemo(() => Object.entries(data.after_structure || {}), [data.after_structure])

  return (
    <section className="results-grid">
      <div className="result-banner">
        <div>
          <p>Output Destination</p>
          <strong>{envMode === 'web' ? 'In-Browser Zipped Download' : (data.destination_path || data.path)}</strong>
          <small>{envMode === 'web' ? (sources?.length || 0) : (data.sources?.length || 0)} source(s) scanned</small>
        </div>
        <span className={data.applied_changes ? 'applied-pill' : 'preview-pill'}>
          {envMode === 'web' ? 'Zipped preview' : (data.applied_changes ? 'Files moved' : 'Preview mode')}
        </span>
      </div>

      <DashboardCards dashboard={data.dashboard} appliedChanges={data.applied_changes} envMode={envMode} />

      <Panel title="s0ucipher AI" icon={BrainCircuit} tone="violet" className="wide-panel">
        <S0ucipherPanel assistant={data.assistant} />
      </Panel>

      <Panel title="Save Organized Result" icon={Download} tone="green" className="wide-panel">
        <SavePanel
          data={data}
          sources={sources}
          envMode={envMode}
          onSaveToChosenLocation={onSaveToChosenLocation}
          onSaveToDownloads={onSaveToDownloads}
          saveResult={saveResult}
          savingAction={savingAction}
        />
      </Panel>

      <Panel title="Before View" icon={ListFilter} tone="pink">
        <FileList files={data.before || []} />
      </Panel>

      <Panel title="After View" icon={FolderTree} tone="blue">
        <div className="folder-list">
          {afterEntries.map(([folder, files]) => (
            <div className="folder-row" key={folder}>
              <div className="folder-heading">
                <FolderTree size={18} />
                <strong>{folder}</strong>
                <span>{files.length}</span>
              </div>
              <div className="mini-file-grid">
                {files.map((file) => (
                  <FilePill key={`${folder}-${file.source}`} file={file} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Categories" icon={Database} tone="green">
        <div className="category-grid">
          {categoryEntries.map(([category, files]) => {
            const Icon = categoryIcons[category] || FolderTree
            return (
              <div className={`category-card category-${category.toLowerCase().replace(' ', '-')}`} key={category}>
                {createElement(Icon, { size: 24 })}
                <div>
                  <strong>{category}</strong>
                  <p>{files.length} files</p>
                </div>
              </div>
            )
          })}
        </div>
      </Panel>

      <Panel title="Smart Suggestions" icon={Zap} tone="yellow" className="wide-panel">
        <Suggestions data={data} />
      </Panel>
    </section>
  )
}

function SavePanel({ data, sources, envMode, onSaveToChosenLocation, onSaveToDownloads, saveResult, savingAction }) {
  return (
    <div className="save-panel">
      <div className="save-copy">
        <p>s0ucipher export</p>
        <h3>Save a clean organized copy after preview.</h3>
        <span>
          {envMode === 'web'
            ? 'Original files stay where they are. NeuroSort compiles everything into category folders and downloads them as a ZIP.'
            : 'Original files stay where they are. NeuroSort copies everything into category folders.'}
        </span>
      </div>

      <div className="save-actions">
        <button
          className="save-action downloads-save"
          disabled={Boolean(savingAction)}
          type="button"
          onClick={() => onSaveToDownloads(data)}
        >
          {savingAction === 'downloads' ? <span className="spinner" /> : <Download size={18} />}
          {savingAction === 'downloads' ? 'Saving...' : 'Save to Downloads'}
        </button>
        {envMode !== 'web' && (
          <button
            className="save-action custom-save"
            disabled={Boolean(savingAction)}
            type="button"
            onClick={() => onSaveToChosenLocation(data)}
          >
            {savingAction === 'custom' ? <span className="spinner" /> : <FolderOpen size={18} />}
            {savingAction === 'custom' ? 'Saving...' : 'Choose Save Location'}
          </button>
        )}
      </div>

      {saveResult && (
        <div className="save-result">
          <CheckCircle2 size={19} />
          <div>
            <strong>{saveResult.assistant_message}</strong>
            <span>{saveResult.export_path}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function DashboardCards({ dashboard, appliedChanges, envMode }) {
  const cards = [
    { label: 'Total Files', value: dashboard?.total_files ?? 0, icon: Files, accent: 'blue' },
    { label: 'Sources', value: envMode === 'web' ? 'Browser' : (dashboard?.source_count ?? 0), icon: FolderTree, accent: 'violet' },
    { label: 'Categories', value: dashboard?.total_categories ?? 0, icon: Database, accent: 'green' },
    { label: 'Important', value: dashboard?.important_files ?? 0, icon: Star, accent: 'pink' },
    { label: 'Study Files', value: dashboard?.study_files ?? 0, icon: BookOpen, accent: 'yellow' },
    { label: 'Duplicates', value: dashboard?.duplicate_groups ?? 0, icon: ShieldCheck, accent: 'orange' },
  ]

  return (
    <div className="dashboard-cards">
      {cards.map(({ label, value, icon: Icon, accent }) => (
        <div className={`metric-card metric-${accent}`} key={label}>
          <span className="metric-icon">{createElement(Icon, { size: 21 })}</span>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
      <div className={`mode-card ${appliedChanges ? 'applied' : ''}`}>
        <CheckCircle2 size={21} />
        <span>{envMode === 'web' ? 'Zip preview' : (appliedChanges ? 'Live organize' : 'Safe preview')}</span>
      </div>
    </div>
  )
}

function Panel({ title, icon: Icon, tone = 'blue', className = '', children }) {
  return (
    <section className={`panel panel-${tone} ${className}`}>
      <div className="panel-title">
        <span>{createElement(Icon, { size: 20 })}</span>
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  )
}

function S0ucipherPanel({ assistant }) {
  if (!assistant) {
    return <p className="muted-text">s0ucipher is waiting for scan data.</p>
  }

  return (
    <div className="assistant-grid">
      <div className="assistant-main">
        <p className="assistant-name">{assistant.name}</p>
        <h3>{assistant.summary}</h3>
        <p>{assistant.safety_note}</p>
      </div>
      <AssistantList title="Recommended actions" items={assistant.recommended_actions || []} />
      <AssistantList title="Study plan" items={assistant.study_plan || []} />
      <AssistantList title="AI abilities" items={assistant.automation_ideas || []} />
    </div>
  )
}

function AssistantList({ title, items }) {
  return (
    <div className="assistant-list">
      <strong>{title}</strong>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

function FileList({ files }) {
  if (!files.length) {
    return <p className="muted-text">No files found in this scan.</p>
  }

  return (
    <ul className="file-list">
      {files.map((file) => {
        const name = typeof file === 'string' ? file : file.name
        const source = typeof file === 'string' ? '' : file.source
        return (
          <li key={source || name}>
            <Files size={16} />
            <span>
              <strong>{name}</strong>
              {source && <small>{source}</small>}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function FilePill({ file }) {
  return (
    <div className={`file-pill priority-${file.priority.toLowerCase()}`}>
      <span>{file.name}</span>
      <small>{file.priority} | {Math.round(file.confidence * 100)}%</small>
      <p>{file.ai_reason}</p>
    </div>
  )
}

function Suggestions({ data }) {
  const hasSuggestions =
    data.duplicates?.length ||
    data.study_files?.length ||
    data.important_files?.length ||
    data.cleanup_suggestions?.length ||
    data.before?.length

  if (!hasSuggestions) {
    return <p className="muted-text">No cleanup or study suggestions yet.</p>
  }

  return (
    <div className="suggestion-grid">
      <SuggestionBlock
        title="Important for exams"
        icon={Star}
        tone="pink"
        items={(data.important_files || []).map((file) => `${file.name} -> High priority`)}
      />
      <SuggestionBlock
        title="Study Hub files"
        icon={BookOpen}
        tone="blue"
        items={(data.study_files || []).map((file) => `${file.name} -> Study Hub`)}
      />
      <SuggestionBlock
        title="Duplicate names"
        icon={ShieldCheck}
        tone="yellow"
        items={(data.duplicates || []).map((group) => `${group.name} -> ${group.count} selected copies`)}
      />
      <SuggestionBlock
        title="Cleanup ideas"
        icon={Trash2}
        tone="green"
        items={(data.cleanup_suggestions || []).map((item) => `${item.file} -> ${item.reason}`)}
      />
      <SuggestionBlock
        title="Name ideas"
        icon={BrainCircuit}
        tone="violet"
        items={(data.before || []).slice(0, 6).map((file) => `${file.name} -> ${file.suggested_name}`)}
      />
    </div>
  )
}

function SuggestionBlock({ title, icon: Icon, tone, items }) {
  return (
    <div className={`suggestion-block suggestion-${tone}`}>
      <h3>{createElement(Icon, { size: 17 })} {title}</h3>
      {items.length ? (
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="muted-text">None found.</p>
      )}
    </div>
  )
}

export default App
