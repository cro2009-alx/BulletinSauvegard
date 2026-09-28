import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, FileText, FolderOpen, Printer, Trash2, UploadCloud, X } from 'lucide-react'
import type { SupabaseClient } from '@supabase/supabase-js'

type ReleveSession = {
  id: string
  school_year: string
  exam_type: 'CEP' | 'BEPC'
  created_at: string
  updated_at: string
  file_count?: number
}

type ReleveFile = {
  id: string
  session_id: string
  file_path: string
  original_filename: string
  relative_path: string
  subfolder: string
  mime_type: string
  size_bytes: number
  created_at: string
}

type Props = { supabase: SupabaseClient | null }

const MAX_FILE_SIZE = 100 * 1024
const ACCEPT = '.pdf,.jpg,.jpeg,.png'
const BATCH_SIZE = 25

function getRelativePath(file: File) {
  return ((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name).replaceAll('\\', '/')
}

function fileKey(file: File) {
  return `${getRelativePath(file)}|${file.size}|${file.lastModified}`
}

function labelFor(session: ReleveSession) {
  return `${session.exam_type} ${session.school_year}`
}

/* Correction : PageTitle est maintenant défini localement dans Releves.tsx */
function PageTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string
  title: string
  description?: string
}) {
  return (
    <div className="page-title">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      {description && <p className="muted">{description}</p>}
    </div>
  )
}

export default function Releves({ supabase }: Props) {
  const [sessions, setSessions] = useState<ReleveSession[]>([])
  const [files, setFiles] = useState<ReleveFile[]>([])
  const [selectedSession, setSelectedSession] = useState<ReleveSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [schoolYear, setSchoolYear] = useState('')
  const [examType, setExamType] = useState<ReleveSession['exam_type']>('BEPC')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [viewer, setViewer] = useState<ReleveFile | null>(null)
  const [viewerUrl, setViewerUrl] = useState('')
  const [deletingSession, setDeletingSession] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  const validYear = /^\d{4}-\d{4}$/.test(schoolYear)

  async function loadSessions() {
    if (!supabase) {
      setError('Supabase doit être configuré.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')

    const { data: sessionRows, error: sessionError } = await supabase
      .from('releve_sessions')
      .select('id, school_year, exam_type, created_at, updated_at')
      .order('created_at', { ascending: false })

    if (sessionError) {
      setError(sessionError.message)
      setLoading(false)
      return
    }

    const { data: fileRows, error: fileError } = await supabase
      .from('releve_files')
      .select('id, session_id')

    if (fileError) {
      setError(fileError.message)
      setLoading(false)
      return
    }

    const counts = new Map<string, number>()

    ;(fileRows ?? []).forEach(row =>
      counts.set(
        row.session_id,
        (counts.get(row.session_id) ?? 0) + 1,
      ),
    )

    setSessions(
      (sessionRows ?? []).map(row => ({
        ...row,
        file_count: counts.get(row.id) ?? 0,
      })) as ReleveSession[],
    )

    setLoading(false)
  }

  async function loadSessionFiles(sessionId: string) {
    if (!supabase) return

    setError('')

    const { data, error: queryError } = await supabase
      .from('releve_files')
      .select(
        'id, session_id, file_path, original_filename, relative_path, subfolder, mime_type, size_bytes, created_at',
      )
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })

    if (queryError) {
      setError(queryError.message)
      return
    }

    setFiles((data ?? []) as ReleveFile[])
  }

  useEffect(() => {
    void loadSessions()
  }, [supabase])

  useEffect(() => {
    if (!selectedSession) return

    void loadSessionFiles(selectedSession.id)
  }, [selectedSession?.id])

  function addFiles(selected: File[]) {
    const merged = [...pendingFiles, ...selected].filter(
      (file, index, list) =>
        list.findIndex(
          other => fileKey(other) === fileKey(file),
        ) === index,
    )

    setPendingFiles(merged)
    setMessage('')
    setError('')
  }

  function validateFiles(selected: File[]) {
    const accepted: File[] = []
    const ignored: string[] = []

    for (const file of selected) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? ''

      if (file.size > MAX_FILE_SIZE) {
        ignored.push(
          `${file.name} — Taille maximum du fichier 100 Ko.`,
        )
        continue
      }

      if (!['pdf', 'jpg', 'jpeg', 'png'].includes(ext)) {
        ignored.push(
          `${file.name} — Format non accepté. Formats autorisés : PDF, JPG, PNG.`,
        )
        continue
      }

      accepted.push(file)
    }

    addFiles(accepted)

    if (ignored.length) {
      setMessage(
        `${ignored.length} fichier(s) ignoré(s) :\n${ignored
          .slice(0, 12)
          .join('\n')}${ignored.length > 12 ? '\n…' : ''}`,
      )
    }
  }

  async function createSession() {
    if (!supabase) return

    if (!validYear) {
      setError(
        'Format attendu : AAAA-AAAA (ex. 2027-2028).',
      )
      return
    }

    setSaving(true)
    setError('')
    setMessage('Création de la session…')

    const form = new FormData()
    form.append('action', 'create-session')
    form.append('school_year', schoolYear.trim())
    form.append('exam_type', examType)

    const { data, error: invokeError } =
      await supabase.functions.invoke('releves', {
        body: form,
      })

    if (invokeError || data?.error) {
      setError(
        invokeError?.message ??
          data?.error ??
          'Impossible de créer la session.',
      )
      setSaving(false)
      return
    }

    const created = data.session as ReleveSession

    setSessions(current => [
      { ...created, file_count: 0 },
      ...current,
    ])

    setSelectedSession(created)
    setShowCreate(false)
    setSchoolYear('')
    setMessage(
      'Session créée. Vous pouvez maintenant importer les fichiers ou le dossier.',
    )
    setSaving(false)
  }

  async function uploadPending() {
    if (!supabase || !selectedSession || !pendingFiles.length) return

    setSaving(true)
    setError('')
    setMessage('Import en cours…')

    let uploadedTotal = 0
    const ignored: string[] = []

    for (
      let start = 0;
      start < pendingFiles.length;
      start += BATCH_SIZE
    ) {
      const batch = pendingFiles.slice(
        start,
        start + BATCH_SIZE,
      )

      const form = new FormData()

      form.append('action', 'upload-batch')
      form.append('session_id', selectedSession.id)

      batch.forEach(file => {
        form.append('files', file, file.name)
        form.append(
          'relative_paths',
          getRelativePath(file),
        )
      })

      const { data, error: invokeError } =
        await supabase.functions.invoke('releves', {
          body: form,
        })

      if (invokeError || data?.error) {
        setError(
          invokeError?.message ??
            data?.error ??
            'Le lot n’a pas pu être importé.',
        )
        break
      }

      uploadedTotal += Number(data?.uploaded ?? 0)

      ;(data?.ignored ?? []).forEach(
        (item: { name: string; reason: string }) =>
          ignored.push(`${item.name} — ${item.reason}`),
      )

      setMessage(
        `Import : ${Math.min(
          start + batch.length,
          pendingFiles.length,
        )} / ${pendingFiles.length}`,
      )
    }

    setPendingFiles([])

    await loadSessionFiles(selectedSession.id)
    await loadSessions()

    setSaving(false)

    setMessage(
      `${uploadedTotal} fichier(s) ajouté(s).${
        ignored.length
          ? ` ${ignored.length} fichier(s) ignoré(s).`
          : ''
      }`,
    )

    if (ignored.length) {
      setError(ignored.slice(0, 15).join('\n'))
    }
  }

  async function openFile(file: ReleveFile) {
    if (!supabase) return

    setViewer(file)
    setViewerUrl('')

    const { data, error: signedError } =
      await supabase.storage
        .from('bulletins')
        .createSignedUrl(file.file_path, 600)

    if (signedError || !data?.signedUrl) {
      setError(
        signedError?.message ??
          'Impossible d’ouvrir ce relevé.',
      )
      return
    }

    setViewerUrl(data.signedUrl)
  }

  async function deleteFile(file: ReleveFile) {
    if (
      !supabase ||
      !window.confirm(
        `Supprimer « ${file.original_filename} » ?`,
      )
    ) {
      return
    }

    const form = new FormData()

    form.append('action', 'delete-file')
    form.append('file_id', file.id)

    const { data, error: invokeError } =
      await supabase.functions.invoke('releves', {
        body: form,
      })

    if (invokeError || data?.error) {
      setError(
        invokeError?.message ??
          data?.error ??
          'Suppression impossible.',
      )
      return
    }

    setFiles(current =>
      current.filter(item => item.id !== file.id),
    )

    setSessions(current =>
      current.map(session =>
        session.id === file.session_id
          ? {
              ...session,
              file_count: Math.max(
                0,
                (session.file_count ?? 0) - 1,
              ),
            }
          : session,
      ),
    )

    if (viewer?.id === file.id) {
      setViewer(null)
      setViewerUrl('')
    }
  }

  async function deleteCurrentSession() {
    if (!supabase || !selectedSession) return

    if (
      !window.confirm(
        `Supprimer définitivement la session « ${labelFor(
          selectedSession,
        )} » et tous ses fichiers ?`,
      )
    ) {
      return
    }

    setDeletingSession(true)
    setError('')

    const form = new FormData()

    form.append('action', 'delete-session')
    form.append('session_id', selectedSession.id)

    const { data, error: invokeError } =
      await supabase.functions.invoke('releves', {
        body: form,
      })

    if (invokeError || data?.error) {
      setError(
        invokeError?.message ??
          data?.error ??
          'Suppression impossible.',
      )
      setDeletingSession(false)
      return
    }

    setSelectedSession(null)
    setFiles([])
    setPendingFiles([])
    setViewer(null)
    setViewerUrl('')

    await loadSessions()

    setDeletingSession(false)
  }

  const folders = useMemo(() => {
    const map = new Map<string, ReleveFile[]>()

    files.forEach(file => {
      const key = file.subfolder || ''

      if (!map.has(key)) {
        map.set(key, [])
      }

      map.get(key)!.push(file)
    })

    return map
  }, [files])

  if (selectedSession) {
    return (
      <>
        <style>{`
          .releve-file-list{display:grid;gap:9px}
          .releve-file-row{display:flex;align-items:center;gap:12px;padding:13px 15px;border:1px solid #e6eaf0;border-radius:14px;background:#fff}
          .releve-file-copy{min-width:0;flex:1}
          .releve-file-copy strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
          .releve-file-copy small{display:block;color:#7b8494;margin-top:3px}
          .releve-upload-box{border:1.5px dashed #bfd0ed;border-radius:18px;padding:20px;background:#f8fbff;display:grid;gap:12px}
          .releve-upload-actions{display:flex;gap:10px;flex-wrap:wrap}
          .releve-muted{color:#7b8494;font-size:13px}
          .releve-preline{white-space:pre-line}
          .releve-folder-title{margin:18px 0 8px;color:#273249;font-size:13px;font-weight:800}
          .releve-session-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:18px}
          .releve-danger{border:1px solid #fecaca;background:#fff;color:#dc2626}
          .releve-viewer{max-width:1100px;width:min(1100px,calc(100vw - 32px));max-height:92vh;overflow:auto}
          .releve-preview{width:100%;height:68vh;border:1px solid #e5e7eb;border-radius:12px;background:#f8fafc}
          .releve-image{display:block;max-width:100%;max-height:68vh;margin:auto;object-fit:contain}
          .releve-inline-actions{display:flex;gap:9px;flex-wrap:wrap;justify-content:flex-end;margin-top:13px}
        `}</style>

        <div className="page-title">
          <p className="eyebrow">RELEVÉS</p>

          <div className="releve-session-head">
            <div>
              <h1>{labelFor(selectedSession)}</h1>

              <p className="muted">
                Créée le{' '}
                {new Date(
                  selectedSession.created_at,
                ).toLocaleDateString('fr-FR')}{' '}
                · {files.length} fichier(s)
              </p>
            </div>

            <button
              className="secondary"
              onClick={() => {
                setSelectedSession(null)
                setFiles([])
                setPendingFiles([])
              }}
            >
              <ChevronLeft size={16} />
              Retour aux sessions
            </button>
          </div>
        </div>

        <div className="releve-upload-box">
          <strong>Ajouter des relevés</strong>

          <span className="releve-muted">
            PDF/JPG/PNG uniquement · 100 Ko maximum par fichier.
            Les fichiers non conformes sont ignorés et listés.
          </span>

          <div className="releve-upload-actions">
            <button
              className="secondary"
              type="button"
              onClick={() =>
                fileInputRef.current?.click()
              }
            >
              <UploadCloud size={17} />
              Ajouter des fichiers
            </button>

            <button
              className="primary"
              type="button"
              onClick={() =>
                folderInputRef.current?.click()
              }
            >
              <FolderOpen size={17} />
              Importer un dossier
            </button>

            <input
              ref={fileInputRef}
              hidden
              type="file"
              multiple
              accept={ACCEPT}
              onChange={e => {
                validateFiles(
                  Array.from(e.target.files ?? []),
                )
                e.currentTarget.value = ''
              }}
            />

            <input
              ref={folderInputRef}
              hidden
              type="file"
              multiple
              {...({
                webkitdirectory: '',
                directory: '',
              } as Record<string, string>)}
              onChange={e => {
                validateFiles(
                  Array.from(e.target.files ?? []),
                )
                e.currentTarget.value = ''
              }}
            />
          </div>

          {pendingFiles.length > 0 && (
            <div className="releve-muted">
              {pendingFiles.length} fichier(s) prêt(s) à être
              envoyé(s).
            </div>
          )}

          {pendingFiles.length > 0 && (
            <button
              className="primary full"
              type="button"
              disabled={saving}
              onClick={() => void uploadPending()}
            >
              {saving
                ? 'Import en cours…'
                : `Importer ${pendingFiles.length} fichier(s)`}
            </button>
          )}

          {message && (
            <div className="success-message releve-preline">
              {message}
            </div>
          )}

          {error && (
            <div className="error-message releve-preline">
              {error}
            </div>
          )}
        </div>

        {Array.from(folders.entries()).map(
          ([folder, folderFiles]) => (
            <section key={folder}>
              <div className="releve-folder-title">
                {folder || 'Racine'} · {folderFiles.length}{' '}
                fichier(s)
              </div>

              <div className="releve-file-list">
                {folderFiles.map(file => (
                  <div
                    className="releve-file-row"
                    key={file.id}
                  >
                    <FileText size={19} />

                    <div className="releve-file-copy">
                      <strong>
                        {file.original_filename}
                      </strong>

                      <small>
                        {folder || 'Racine'} ·{' '}
                        {(file.size_bytes / 1024).toFixed(1)} Ko ·{' '}
                        {new Date(
                          file.created_at,
                        ).toLocaleDateString('fr-FR')}
                      </small>
                    </div>

                    <button
                      className="secondary"
                      onClick={() =>
                        void openFile(file)
                      }
                    >
                      Ouvrir
                    </button>

                    <button
                      className="secondary"
                      onClick={() =>
                        void deleteFile(file)
                      }
                      title="Supprimer"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ),
        )}

        <div className="releve-inline-actions">
          <button
            className="secondary releve-danger"
            disabled={deletingSession}
            onClick={() =>
              void deleteCurrentSession()
            }
          >
            <Trash2 size={16} />
            Supprimer toute la session
          </button>
        </div>

        {viewer && (
          <div
            className="modal-backdrop"
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-card releve-viewer">
              <button
                className="modal-close"
                onClick={() => {
                  setViewer(null)
                  setViewerUrl('')
                }}
              >
                <X size={18} />
              </button>

              <p className="eyebrow">RELEVÉ</p>

              <h2>{viewer.original_filename}</h2>

              <p className="muted">
                {viewer.subfolder || 'Racine'} ·{' '}
                {selectedSession.exam_type}{' '}
                {selectedSession.school_year}
              </p>

              {!viewerUrl ? (
                <div className="empty-state compact">
                  <FileText size={28} />
                  <h2>Ouverture…</h2>
                </div>
              ) : viewer.mime_type.startsWith('image/') ? (
                <img
                  className="releve-image"
                  src={viewerUrl}
                  alt={viewer.original_filename}
                />
              ) : (
                <iframe
                  className="releve-preview"
                  title={viewer.original_filename}
                  src={viewerUrl}
                />
              )}

              <div className="releve-inline-actions">
                <a
                  className="secondary"
                  href={viewerUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Ouvrir
                </a>

                <a
                  className="secondary"
                  href={viewerUrl}
                  download={viewer.original_filename}
                >
                  <Download size={16} />
                  Télécharger
                </a>

                <button
                  className="secondary"
                  onClick={() => {
                    const printWindow =
                      window.open(
                        viewerUrl,
                        '_blank',
                      )

                    printWindow?.addEventListener(
                      'load',
                      () => printWindow.print(),
                    )
                  }}
                >
                  <Printer size={16} />
                  Imprimer
                </button>

                <button
                  className="secondary"
                  onClick={() => {
                    setViewer(null)
                    setViewerUrl('')
                  }}
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  return (
    <>
      <style>{`
        .releve-session-grid{
          display:grid;
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:15px
        }

        .releve-session-card{
          border:1px solid #e5e9f0;
          background:#fff;
          border-radius:18px;
          padding:19px;
          display:flex;
          align-items:center;
          gap:14px;
          text-align:left;
          cursor:pointer;
          box-shadow:0 10px 30px rgba(24,39,75,.06);
          transition:.2s
        }

        .releve-session-card:hover{
          transform:translateY(-2px);
          box-shadow:0 16px 38px rgba(24,39,75,.1);
          border-color:#c8d7f3
        }

        .releve-session-icon{
          width:48px;
          height:48px;
          display:grid;
          place-items:center;
          border-radius:14px;
          background:#eef4ff;
          color:#2563eb
        }

        .releve-session-copy{
          min-width:0;
          flex:1
        }

        .releve-session-copy strong{
          display:block;
          font-size:16px;
          color:#273249
        }

        .releve-session-copy small{
          display:block;
          color:#7b8494;
          margin-top:5px
        }

        .releve-create-card{
          display:grid;
          gap:15px;
          margin-bottom:22px
        }

        .releve-create-row{
          display:grid;
          grid-template-columns:1fr 220px auto;
          gap:10px;
          align-items:end
        }

        .releve-note{
          padding:13px 15px;
          border-radius:12px;
          background:#f8fafc;
          color:#64748b;
          font-size:13px
        }

        @media(max-width:760px){
          .releve-session-grid{
            grid-template-columns:1fr
          }

          .releve-create-row{
            grid-template-columns:1fr
          }

          .releve-file-row{
            align-items:flex-start;
            flex-wrap:wrap
          }

          .releve-file-row .releve-file-copy{
            width:calc(100% - 42px)
          }
        }
      `}</style>

      <PageTitle
        eyebrow="RELEVÉS"
        title="Sessions de relevés"
        description="Chaque session est indépendante des bulletins et n’utilise pas de lettre de salle."
      />

      <div className="releve-note">
        Les relevés utilisent le même quota que les bulletins.
        Formats acceptés : PDF, JPG, PNG. Taille maximale :
        100 Ko par fichier.
      </div>

      <div
        className="section-heading"
        style={{ marginTop: 18 }}
      >
        <h2>Vos sessions</h2>

        <button
          className="primary"
          onClick={() => {
            setShowCreate(true)
            setError('')
            setMessage('')
          }}
        >
          + Créer une session de relevé
        </button>
      </div>

      {showCreate && (
        <div className="form-card releve-create-card">
          <h2>Créer une session</h2>

          <div className="releve-create-row">
            <label>
              Année scolaire

              <input
                value={schoolYear}
                onChange={e =>
                  setSchoolYear(e.target.value)
                }
                placeholder="2027-2028"
                pattern="\d{4}-\d{4}"
              />
            </label>

            <label>
              Classe / examen

              <select
                value={examType}
                onChange={e =>
                  setExamType(
                    e.target.value as ReleveSession['exam_type'],
                  )
                }
              >
                <option>CEP</option>
                <option>BEPC</option>
              </select>
            </label>

            <div
              style={{
                display: 'flex',
                gap: 8,
              }}
            >
              <button
                className="secondary"
                type="button"
                onClick={() =>
                  setShowCreate(false)
                }
              >
                Annuler
              </button>

              <button
                className="primary"
                type="button"
                disabled={saving}
                onClick={() =>
                  void createSession()
                }
              >
                {saving
                  ? 'Création…'
                  : 'Créer la session'}
              </button>
            </div>
          </div>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="empty-state compact">
          <UploadCloud size={28} />
          <h2>Chargement…</h2>
        </div>
      ) : sessions.length === 0 ? (
        <div className="empty-state">
          <FileText size={28} />
          <h2>Aucune session de relevé</h2>
          <p>
            Créez votre première session pour commencer.
          </p>
        </div>
      ) : (
        <div className="releve-session-grid">
          {sessions.map(session => (
            <button
              className="releve-session-card"
              key={session.id}
              onClick={() => {
                setSelectedSession(session)
                setError('')
                setMessage('')
              }}
            >
              <span className="releve-session-icon">
                <FolderOpen size={22} />
              </span>

              <span className="releve-session-copy">
                <strong>
                  {labelFor(session)}
                </strong>

                <small>
                  {session.file_count ?? 0} fichier(s) ·
                  Créée le{' '}
                  {new Date(
                    session.created_at,
                  ).toLocaleDateString('fr-FR')}
                </small>
              </span>

              <ChevronRight size={18} />
            </button>
          ))}
        </div>
      )}
    </>
  )
}