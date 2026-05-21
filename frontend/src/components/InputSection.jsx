import { useState, useRef } from 'react'
import {
  CheckCircle2,
  FilePlus2,
  Files,
  FolderOpen,
  FolderPlus,
  Play,
  X,
  ShieldCheck,
  HelpCircle,
  Settings,
  Moon,
  Sun,
  ArrowUp,
  SortAsc,
} from 'lucide-react'

export default function InputSection({
  onChooseDestination,
  onChooseFiles,
  onChooseFolders,
  onSubmit,
  choosingAction,
  loading,
  envMode,
  sortBy,
  onSortByChange,
  theme,
  onToggleTheme,
  onOpenSettings,
  onOpenHelp,
}) {
  const [sources, setSources] = useState([])
  const [saveLocationMode, setSaveLocationMode] = useState('downloads')
  const [destinationPath, setDestinationPath] = useState('')
  const [applyChanges, setApplyChanges] = useState(false)
  const [dragActive, setDragActive] = useState(false)

  const filesInputRef = useRef(null)
  const foldersInputRef = useRef(null)

  const sourceKey = (source) => (
    typeof source === 'string'
      ? source
      : `${source.webkitRelativePath || source.name}|${source.size}|${source.lastModified}`
  )

  const sourceDisplayName = (source) => (
    typeof source === 'string'
      ? source
      : (source.webkitRelativePath || source.name)
  )

  const sourceKind = (source) => {
    if (typeof source !== 'string') {
      return source.webkitRelativePath ? 'Folder item' : 'File'
    }

    const leafName = source.split('/').filter(Boolean).pop() || source
    return leafName.includes('.') ? 'File path' : 'Folder path'
  }

  const addSources = (paths) => {
    setSources((currentSources) => {
      const merged = [...currentSources, ...paths]
      const unique = []
      const seen = new Set()
      for (const source of merged) {
        const key = sourceKey(source)
        if (!seen.has(key)) {
          seen.add(key)
          unique.push(source)
        }
      }
      return unique
    })
  }

  const handleFilesInputChange = (event) => {
    const selectedFiles = Array.from(event.target.files)
    if (selectedFiles.length) {
      addSources(selectedFiles)
    }
    event.target.value = ''
  }

  const handleDragOver = (event) => {
    event.preventDefault()
    setDragActive(true)
  }

  const handleDragLeave = (event) => {
    if (event.currentTarget.contains(event.relatedTarget)) return
    setDragActive(false)
  }

  const handleDrop = async (event) => {
    event.preventDefault()
    setDragActive(false)

    const items = event.dataTransfer.items
    if (!items) return

    const fileEntries = []

    const traverseFileTree = (item, path = '') => {
      return new Promise((resolve) => {
        if (item.isFile) {
          item.file((file) => {
            Object.defineProperty(file, 'webkitRelativePath', {
              value: path + file.name,
              writable: false,
            })
            fileEntries.push(file)
            resolve()
          })
        } else if (item.isDirectory) {
          const dirReader = item.createReader()
          const readAllEntries = () => {
            dirReader.readEntries((entries) => {
              if (entries.length === 0) {
                resolve()
              } else {
                const promises = entries.map((entry) => traverseFileTree(entry, path + item.name + '/'))
                Promise.all(promises).then(() => resolve())
              }
            })
          }
          readAllEntries()
        } else {
          resolve()
        }
      })
    }

    const entryPromises = []
    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry()
      if (entry) {
        entryPromises.push(traverseFileTree(entry))
      }
    }

    await Promise.all(entryPromises)
    if (fileEntries.length) {
      addSources(fileEntries)
    } else {
      // Fallback for standard files
      const droppedFiles = Array.from(event.dataTransfer.files)
      if (droppedFiles.length) {
        addSources(droppedFiles)
      }
    }
  }

  const handleChooseFiles = async () => {
    if (envMode === 'web') {
      filesInputRef.current?.click()
    } else {
      const selectedPaths = await onChooseFiles()
      addSources(selectedPaths)
    }
  }

  const handleChooseFolders = async () => {
    if (envMode === 'web') {
      foldersInputRef.current?.click()
    } else {
      const selectedPaths = await onChooseFolders()
      addSources(selectedPaths)
    }
  }

  const handleChooseDestination = async () => {
    if (envMode === 'web') return
    const selectedPath = await onChooseDestination()
    if (selectedPath) {
      setDestinationPath(selectedPath)
    }
  }

  const handleRemoveSource = (source) => {
    setSources((currentSources) => currentSources.filter((item) => item !== source))
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    onSubmit({ sources, destinationPath, sortBy, applyChanges, saveLocationMode })
  }

  const isChoosing = Boolean(choosingAction)

  // Auto trigger folder destination dialog if user checks Choose Save Location in local mode
  const handleSelectSaveMode = async (mode) => {
    setSaveLocationMode(mode)
    if (mode === 'custom' && envMode !== 'web' && !destinationPath) {
      const selectedPath = await onChooseDestination()
      if (selectedPath) {
        setDestinationPath(selectedPath)
      } else {
        setSaveLocationMode('downloads')
      }
    }
  }

  return (
    <div className="sidebar">
      {/* Redesigned Sidebar Brand Header */}
      <div className="sidebar-brand">
        <span className="brand-logo-mark">N</span>
        <span className="brand-title-text">NeuroSort AI</span>
      </div>

      <form className="sidebar-form" onSubmit={handleSubmit}>
        {/* SOURCE Section */}
        <div className="sidebar-section">
          <span className="sidebar-section-title">SOURCE</span>

          <div className="source-button-grid">
            <button
              className="add-files-btn"
              disabled={isChoosing || loading}
              type="button"
              onClick={handleChooseFiles}
            >
              {choosingAction === 'files' ? <span className="spinner" /> : <FilePlus2 size={18} />}
              Add Files
            </button>

            <button
              className="add-folders-btn"
              disabled={isChoosing || loading}
              type="button"
              onClick={handleChooseFolders}
            >
              {choosingAction === 'folders' ? <span className="spinner" /> : <FolderPlus size={18} />}
              Add Folders
            </button>
          </div>

          <input
            type="file"
            multiple
            ref={filesInputRef}
            style={{ display: 'none' }}
            onChange={handleFilesInputChange}
          />
          <input
            type="file"
            multiple
            webkitdirectory="true"
            directory="true"
            ref={foldersInputRef}
            style={{ display: 'none' }}
            onChange={handleFilesInputChange}
          />

          {/* Styled Drag & Drop Area */}
          <div
            className={`sidebar-drag-zone ${dragActive ? 'drag-active' : ''}`}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <div className="drag-zone-content">
              <ArrowUp size={24} className="drag-arrow-icon" />
              <p>Drag & drop files or folders here</p>
              <span>You can add multiple items in a batch</span>
            </div>
          </div>

          {/* List of Scanned Sources */}
          {sources.length > 0 && (
            <div className="sidebar-source-list">
              {sources.map((source) => {
                const displayName = sourceDisplayName(source)
                const key = sourceKey(source)
                const SourceIcon = sourceKind(source).includes('Folder') ? FolderOpen : Files
                return (
                  <div className="source-item-row" key={key}>
                    <SourceIcon size={16} />
                    <span className="source-item-name" title={displayName}>{displayName}</span>
                    <button
                      className="source-remove-btn"
                      type="button"
                      onClick={() => handleRemoveSource(source)}
                      aria-label={`Remove ${displayName}`}
                    >
                      <X size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* SAVE LOCATION Section */}
        <div className="sidebar-section">
          <span className="sidebar-section-title">SAVE LOCATION</span>

          <div className="save-location-group">
            <label
              className={`save-location-option ${saveLocationMode === 'downloads' ? 'selected' : ''}`}
              onClick={() => handleSelectSaveMode('downloads')}
            >
              <input
                type="radio"
                name="saveLocation"
                checked={saveLocationMode === 'downloads'}
                onChange={() => {}}
                style={{ display: 'none' }}
              />
              <span className="radio-indicator" />
              <div className="option-text-block">
                <strong>Save to Downloads</strong>
                <span>Default Location</span>
              </div>
            </label>

            <label
              className={`save-location-option ${saveLocationMode === 'custom' ? 'selected' : ''}`}
              onClick={() => handleSelectSaveMode('custom')}
            >
              <input
                type="radio"
                name="saveLocation"
                checked={saveLocationMode === 'custom'}
                onChange={() => {}}
                style={{ display: 'none' }}
              />
              <span className="radio-indicator" />
              <div className="option-text-block">
                <strong>Choose Save Location</strong>
                <span>Select a custom folder</span>
              </div>
            </label>

            {saveLocationMode === 'custom' && (
              <div className="custom-path-display" onClick={handleChooseDestination}>
                <span className="path-text" title={destinationPath || 'Click to choose output path...'}>
                  {destinationPath || 'Click to choose path...'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Additional Controls */}
        <div className="sidebar-section">
          <div className="controls-row">
            <label className="sidebar-select-wrap">
              <SortAsc size={16} />
              <select value={sortBy} onChange={(event) => onSortByChange(event.target.value)} disabled={loading}>
                <option value="name">Alphabetical</option>
                <option value="type">File type</option>
                <option value="priority">Priority (High to Low)</option>
                <option value="size-desc">Size (Largest first)</option>
                <option value="size-asc">Size (Smallest first)</option>
              </select>
            </label>

            {envMode !== 'web' && (
              <label className="sidebar-toggle-row">
                <input
                  type="checkbox"
                  checked={applyChanges}
                  onChange={(event) => setApplyChanges(event.target.checked)}
                  disabled={loading}
                />
                <span>{applyChanges ? 'Live Move' : 'Preview Only'}</span>
              </label>
            )}
          </div>
        </div>

        {/* Action Button */}
        <button
          className="sidebar-submit-btn"
          type="submit"
          disabled={loading || !sources.length}
        >
          {loading ? <span className="spinner" /> : <Play size={16} />}
          {loading ? 'Scanning...' : 'Organize Batch'}
        </button>
      </form>

      {/* Security Footer Notice */}
      <div className="sidebar-security-badge">
        <ShieldCheck size={18} className="shield-icon" />
        <div className="security-text-block">
          <strong>Secure. Private. Local First.</strong>
          <span>Your files stay on your device.</span>
        </div>
      </div>

      {/* Icon Utility Tray */}
      <div className="sidebar-utility-tray">
        <button type="button" aria-label="Settings" className="tray-btn" onClick={onOpenSettings}>
          <Settings size={18} />
        </button>
        <button type="button" aria-label="Toggle Theme" className="tray-btn" onClick={onToggleTheme}>
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <button type="button" aria-label="Help" className="tray-btn" onClick={onOpenHelp}>
          <HelpCircle size={18} />
        </button>
      </div>
    </div>
  )
}
