import { Component, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { Archive, Bell, Building2, ChevronLeft, ChevronRight, CircleHelp, Download, Eye, EyeOff, FilePlus2, FileText, FolderOpen, LayoutDashboard, LogOut, Menu, Printer, Search, ShieldCheck, Trash2, UploadCloud, Users, X } from 'lucide-react'
import './App.css'
import Releves from './Releves'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null
type View = 'dashboard' | 'archives' | 'upload' | 'releves' | 'search' | 'subscription' | 'notifications' | 'establishment'
const navItems: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Accueil', icon: LayoutDashboard }, { id: 'upload', label: 'Ajouter des bulletins', icon: FilePlus2 }, { id: 'archives', label: 'Archives', icon: Archive }, { id: 'releves', label: 'Relevés', icon: FolderOpen }, { id: 'search', label: 'Recherche', icon: Search }, { id: 'subscription', label: 'Mon abonnement', icon: ShieldCheck }, { id: 'notifications', label: 'Notifications', icon: Bell }, { id: 'establishment', label: 'Mon établissement', icon: Building2 },
]
const defaultStats = { bulletins: 0, students: 0, years: 0 }

// Supprime la session Supabase enregistrée dans le navigateur (session corrompue ou bloquée)
// puis renvoie vers la page de connexion.
function resetLocalSession() {
  try {
    Object.keys(window.localStorage)
      .filter(storageKey => storageKey.startsWith('sb-') || storageKey.includes('supabase'))
      .forEach(storageKey => window.localStorage.removeItem(storageKey))
    window.sessionStorage.clear()
  } catch {
    // Le stockage peut être indisponible (navigation privée stricte) : on continue quand même.
  }
  window.location.href = '/connexion'
}

// Écran de chargement toujours visible. Si l'attente dépasse 6 secondes,
// on propose de recharger ou de réinitialiser la session au lieu de laisser une page blanche.
function SessionLoader({ label = 'Chargement de votre session…' }: { label?: string }) {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 6000)
    return () => window.clearTimeout(timer)
  }, [])
  return <div role="status" aria-live="polite" style={{ minHeight: '100vh', display: 'grid', placeContent: 'center', justifyItems: 'center', gap: 14, padding: 24, textAlign: 'center', color: '#586274', background: '#fff' }}>
    <style>{`@keyframes movaSessionSpin{to{transform:rotate(360deg)}}`}</style>
    <span style={{ width: 34, height: 34, border: '3px solid #dbe5f1', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'movaSessionSpin .7s linear infinite' }} />
    <strong style={{ color: '#273249' }}>{label}</strong>
    {slow && <>
      <p style={{ margin: 0, maxWidth: 380, lineHeight: 1.5 }}>Cela prend plus de temps que prévu. Vérifiez votre connexion internet, puis réessayez.</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button className="secondary" type="button" onClick={() => window.location.reload()}>Réessayer</button>
        <button className="primary" type="button" onClick={resetLocalSession}>Réinitialiser la session</button>
      </div>
    </>}
  </div>
}

// Filet de sécurité : si un écran plante à l'affichage, on montre l'erreur au lieu d'une page blanche.
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Erreur d’affichage MOVA :', error, info.componentStack) }
  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return <div role="alert" style={{ minHeight: '100vh', display: 'grid', placeContent: 'center', justifyItems: 'center', gap: 14, padding: 24, textAlign: 'center', background: '#fff', color: '#273249' }}>
      <h1 style={{ margin: 0, fontSize: 24 }}>Une erreur est survenue</h1>
      <p style={{ margin: 0, maxWidth: 420, lineHeight: 1.5, color: '#586274' }}>La page n'a pas pu s'afficher. Rechargez la page ; si le problème continue, réinitialisez la session.</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button className="secondary" type="button" onClick={() => window.location.reload()}>Recharger la page</button>
        <button className="primary" type="button" onClick={resetLocalSession}>Réinitialiser la session</button>
      </div>
      <details style={{ maxWidth: 520, color: '#7b8494', fontSize: 12 }}>
        <summary style={{ cursor: 'pointer' }}>Détails techniques</summary>
        <pre style={{ whiteSpace: 'pre-wrap', textAlign: 'left', margin: '8px 0 0' }}>{error.message}</pre>
      </details>
    </div>
  }
}

function AppContent() {
  const [view, setView] = useState<View>(() => new URLSearchParams(window.location.search).get('view') === 'archives' ? 'archives' : 'dashboard')
  const [mobileNav, setMobileNav] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [sessionEmail, setSessionEmail] = useState<string | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [message, setMessage] = useState('')
  const [role, setRole] = useState('')
  const [roleReady, setRoleReady] = useState(false)
  const [, setRouteTick] = useState(0)
  const [stats, setStats] = useState(defaultStats)
  const [establishmentName, setEstablishmentName] = useState('')

  // Change l'adresse sans recharger la page ET force l'affichage de la nouvelle page.
  function navigate(path: string) {
    window.history.replaceState({}, '', path)
    setRouteTick(tick => tick + 1)
  }

  useEffect(() => {
    if (!supabase) {
      const timer = window.setTimeout(() => setSessionReady(true), 0)
      return () => window.clearTimeout(timer)
    }

    let active = true

    const restoreSession = async () => {
      try {
        // Sur une connexion lente, on n'attend pas indéfiniment : après 8 secondes on affiche
        // l'application, et la session s'ajoute dès que Supabase répond (écouteur ci-dessous).
        const result = await Promise.race([
          supabase!.auth.getSession(),
          new Promise<'timeout'>(resolve => window.setTimeout(() => resolve('timeout'), 8000)),
        ])
        if (!active) return
        if (result === 'timeout') return
        if (result.error) {
          setMessage('Impossible de restaurer la session. Veuillez vous reconnecter.')
          setSessionEmail(null)
        } else {
          setSessionEmail(result.data.session?.user.email ?? null)
        }
      } catch {
        if (active) {
          setSessionEmail(null)
          setMessage('Impossible de restaurer la session. Veuillez vous reconnecter.')
        }
      } finally {
        if (active) setSessionReady(true)
      }
    }

    void restoreSession()

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      if (event === 'SIGNED_OUT') {
        setSessionEmail(null)
        setRole('')
        setRoleReady(false)
        setStats(defaultStats)
        setEstablishmentName('')
      } else if (session?.user) {
        setSessionEmail(session.user.email ?? null)
      }
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!supabase || !sessionEmail) return

    let cancelled = false

    const loadWorkspace = async () => {
      try {
        // getSession lit la session locale : pas d'appel réseau supplémentaire (contrairement à getUser).
        const { data: sessionData } = await supabase!.auth.getSession()
        const userId = sessionData.session?.user.id
        if (!userId) {
          if (!cancelled) setRoleReady(true)
          return
        }

        // Les compteurs partent en même temps que le profil pour ne pas ralentir les écoles.
        const countsPromise = Promise.all([
          supabase!.from('bulletins').select('id', { count: 'exact', head: true }),
          supabase!.from('students').select('id', { count: 'exact', head: true }),
          supabase!.from('school_years').select('id', { count: 'exact', head: true }),
        ])

        const { data: profileData } = await supabase!
          .from('profiles')
          .select('role, establishment_id')
          .eq('id', userId)
          .maybeSingle()

        if (cancelled) return

        // Le rôle est connu tout de suite : /admin peut s'afficher sans passer par l'espace école.
        setRole(profileData?.role ?? '')
        setRoleReady(true)

        if (profileData?.role === 'platform_admin') {
          setStats(defaultStats)
          setEstablishmentName('')
          return
        }

        const [b, s, y] = await countsPromise
        if (cancelled) return

        setStats({
          bulletins: b.count ?? 0,
          students: s.count ?? 0,
          years: y.count ?? 0,
        })

        if (!profileData?.establishment_id) {
          setEstablishmentName('')
          return
        }

        const { data: establishment } = await supabase!
          .from('establishments')
          .select('official_name')
          .eq('id', profileData.establishment_id)
          .maybeSingle()

        if (!cancelled) setEstablishmentName(establishment?.official_name ?? '')
      } catch (loadError) {
        console.error('Chargement de l’espace impossible :', loadError)
        if (!cancelled) setRoleReady(true)
      }
    }

    void loadWorkspace()
    return () => { cancelled = true }
  }, [sessionEmail])

  async function signIn(e: React.FormEvent) {
    e.preventDefault()
    setMessage('')
    if (!supabase) {
      setMessage('Configurez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env.local.')
      return
    }

    const cleanEmail = email.trim()
    if (!cleanEmail || !password) {
      setMessage('Veuillez renseigner votre e-mail et votre mot de passe.')
      return
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    })

    if (error || !data.user) {
      setMessage(error?.message ?? 'Connexion impossible. Vérifiez vos identifiants.')
      return
    }

    // On vérifie le profil avec l'identifiant exact de l'utilisateur connecté.
    // Cela évite de dépendre d'un état React ou du listener Supabase pour terminer la connexion.
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role, establishment_id')
      .eq('id', data.user.id)
      .maybeSingle()

    if (profileError) {
      setMessage('Votre session est ouverte, mais votre profil établissement ne peut pas être chargé. Réessayez.')
      await supabase.auth.signOut()
      setSessionEmail(null)
      return
    }

    setSessionEmail(data.user.email ?? cleanEmail)
    setRole(profile?.role ?? '')
    setRoleReady(true)

    if (!profile) {
      navigate('/demande-en-cours')
      return
    }

    // Un compte déjà activé arrive directement dans son espace.
    navigate(profile.role === 'platform_admin' ? '/admin' : '/')
    if (profile.establishment_id) {
      const { data: establishment } = await supabase
        .from('establishments')
        .select('official_name')
        .eq('id', profile.establishment_id)
        .maybeSingle()
      setEstablishmentName(establishment?.official_name ?? '')
    }
  }

  async function signOut() {
    // On affiche immédiatement la page de connexion avant que l'état Supabase
    // ne déclenche le rendu de la page d'accueil.
    setSigningOut(true)
    window.history.replaceState({}, '', '/connexion')
    try {
      await supabase?.auth.signOut()
    } finally {
      setSessionEmail(null); setRole(''); setRoleReady(false); setStats(defaultStats); setEstablishmentName('')
      setMobileNav(false)
      setSigningOut(false)
    }
  }

  if (!sessionReady) return <SessionLoader />
  const path = window.location.pathname
  if (path === '/demande-acces') return <AccessRequestV2 authenticated={Boolean(sessionEmail)} />
  if (path === '/demande-en-cours' && sessionEmail) return <PendingAccessRequest />
  if (!sessionEmail && path === '/activation') return <Activation />
  if (!sessionEmail && path !== '/connexion' && !signingOut) return <Home />
  if (!sessionEmail) return <Auth email={email} setEmail={setEmail} password={password} setPassword={setPassword} message={message} onSubmit={signIn} />
  if (path === '/admin') {
    // On attend de connaître le rôle : sinon l'espace école s'afficherait un instant avant l'admin.
    if (!roleReady) return <SessionLoader label="Vérification de vos droits…" />
    if (role === 'platform_admin') return <AdminV2 />
  }

  return <div className="app-shell">
    <aside className={mobileNav ? 'sidebar open' : 'sidebar'}>
      <div className="brand"><span className="brand-mark"><Archive size={20} /></span><span>Sauvegarde<br /><strong>Bulletin</strong></span><button className="close-nav" onClick={() => setMobileNav(false)}><X size={18} /></button></div>
      <div className="school-chip">
        <span className="avatar">{(establishmentName || sessionEmail).slice(0, 2).toUpperCase()}</span>
        <span><strong>{establishmentName || 'Établissement'}</strong><small>Compte administrateur</small></span>
      </div>
      <p className="nav-heading">ESPACE DE TRAVAIL</p>
      <nav>{navItems.map(({ id, label, icon: Icon }) => <button className={view === id ? 'nav-item active' : 'nav-item'} key={id} onClick={() => { setView(id); setMobileNav(false) }}><Icon size={18} />{label}{id === 'notifications' && <span className="nav-badge">2</span>}</button>)}</nav>
      <div className="sidebar-bottom">
        <div className="help"><CircleHelp size={18} /><span><strong>Besoin d'aide ?</strong><small>Notre équipe vous accompagne</small></span></div>
        <button className="logout" onClick={signOut}><LogOut size={17} /> Se déconnecter</button>
      </div>
    </aside>
    <main className="main-content">
      <header className="topbar">
        <button className="menu-button" onClick={() => setMobileNav(true)}><Menu size={20} /></button>
        <div className="breadcrumb"><span>Espace établissement</span><ChevronRight size={15} /><strong>{navItems.find(item => item.id === view)?.label}</strong></div>
        <div className="top-actions">
          <button className="icon-button" onClick={() => setView('notifications')} aria-label="Notifications"><Bell size={19} /><i /></button>
          <div className="user"><span className="avatar">{sessionEmail.slice(0, 2).toUpperCase()}</span><span><strong>{sessionEmail.split('@')[0]}</strong><small>Administrateur</small></span></div>
        </div>
      </header>
      <div className="page-wrap">
        {view === 'dashboard' && <Dashboard stats={stats} go={setView} email={sessionEmail} />}
        {view === 'archives' && <Archives />}
        {view === 'upload' && <Upload />}
        {view === 'releves' && <Releves supabase={supabase} />}
        {view === 'search' && <SearchPage />}
        {view === 'subscription' && <Subscription />}
        {view === 'notifications' && <Notifications />}
        {view === 'establishment' && <Establishment email={sessionEmail} />}
      </div>
    </main>
  </div>
}

function App() {
  return <ErrorBoundary><AppContent /></ErrorBoundary>
}

function Home() { return <div className="public-page"><header className="public-nav"><a href="/" className="auth-brand"><span className="brand-mark"><Archive size={22} /></span><span>MOVA <strong>Sauvegarde</strong></span></a><a className="public-login" href="/connexion">J'ai déjà un accès <ChevronRight size={16} /></a></header><main><section className="public-hero"><p className="eyebrow">ARCHIVAGE SCOLAIRE SÉCURISÉ</p><h1>Vos bulletins, conservés<br /><em>pour les années à venir.</em></h1><p>Une solution professionnelle pour archiver, organiser et retrouver les bulletins scolaires de votre établissement.</p><a className="primary hero-button" href="/demande-acces">Demander l'accès pour mon établissement <ChevronRight size={17} /></a></section><section className="feature-grid"><PublicFeature icon={Archive} title="Archiver" text="Conservez vos bulletins dans un espace privé et durable." /><PublicFeature icon={Search} title="Retrouver" text="Recherchez rapidement par classe et année scolaire." /><PublicFeature icon={ShieldCheck} title="Protéger" text="Vos données restent isolées et accessibles uniquement à votre établissement." /><PublicFeature icon={FileText} title="Consulter" text="Ouvrez, téléchargez ou imprimez vos documents quand vous en avez besoin." /></section><section className="controlled"><div><p className="eyebrow">UN ACCÈS CONTRÔLÉ</p><h2>Ce service n'est pas ouvert<br />au grand public.</h2><p>MOVA Sauvegarde est réservé aux établissements scolaires privés du Bénin. Chaque demande est vérifiée par notre équipe avant toute activation.</p></div><div className="access-steps"><span><b>01</b> Demande d'accès</span><span><b>02</b> Vérification MOVA</span><span><b>03</b> Code d'activation</span><span><b>04</b> Vos archives sécurisées</span></div></section><section className="pricing"><p className="eyebrow">FORMULES SIMPLES</p><h2>Un abonnement adapté<br />à votre établissement.</h2><div className="public-plans"><PublicPlan title="Petite échelle" price="17 000" detail="12 mois · jusqu’à 5 000 bulletins + 50 bonus" /><PublicPlan title="Grande échelle" price="44 000" detail="12 mois · bulletins illimités + anciens bulletins" featured /></div></section></main><footer className="public-footer">MOVA Sauvegarde <span>Vos bulletins scolaires sont conservés, organisés et retrouvables quand vous en avez besoin.</span></footer></div> }
function PublicFeature({ icon: Icon, title, text }: { icon: typeof Archive; title: string; text: string }) { return <div className="public-feature"><span className="action-icon"><Icon size={21} /></span><h3>{title}</h3><p>{text}</p></div> }
function PublicPlan({ title, price, detail, featured = false }: { title: string; price: string; detail: string; featured?: boolean }) { return <div className={featured ? 'public-plan featured' : 'public-plan'}><small>{title}</small><strong>{price} <i>FCFA</i></strong><span>{detail}</span>{featured && <b>Le meilleur tarif</b>}</div> }

function AccessRequestV2({ authenticated }: { authenticated: boolean }) {
  const [account, setAccount] = useState({ email: '', password: '', confirmPassword: '' })
  const [accountReady, setAccountReady] = useState(authenticated)
  const [showAccountPassword, setShowAccountPassword] = useState(false)
  const [showAccountConfirmPassword, setShowAccountConfirmPassword] = useState(false)
  const [form, setForm] = useState({ establishment_name: '', city: '', country: 'Bénin', authorization_number: '', ifu: '', requester_name: '', requester_role: '', email: '', phone: '', address: '' })
  const [status, setStatus] = useState('')
  const change = (key: string, value: string) => setForm(current => ({ ...current, [key]: value }))
  useEffect(() => {
    if (!authenticated || !supabase) return
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setForm(current => ({ ...current, email: data.user.email ?? '' }))
    })
  }, [authenticated])
  async function createAccount(event: React.FormEvent) {
    event.preventDefault(); if (!supabase) return setStatus('Configurez Supabase pour créer votre compte.')
    if (account.password !== account.confirmPassword) return setStatus('Les mots de passe ne correspondent pas.')
    const { data, error } = await supabase.auth.signUp({ email: account.email, password: account.password })
    if (error) return setStatus(error.message)
    if (!data.session) return setStatus('Vérifiez votre e-mail pour confirmer votre compte, puis reconnectez-vous.')
    setForm(current => ({ ...current, email: account.email })); setAccountReady(true); setStatus('')
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!supabase) return setStatus('Configurez Supabase pour transmettre cette demande.')
    if (Object.values(form).some(value => !value.trim())) return setStatus('Veuillez renseigner tous les champs obligatoires.')
    const payload = new FormData(); Object.entries(form).forEach(([key, value]) => payload.append(key, value))
    const { error } = await supabase.functions.invoke('request-access', { body: payload })
    if (error) return setStatus(error.message)
    window.location.href = '/demande-en-cours'
  }
  if (!accountReady) return <div className="public-form-page"><a href="/" className="auth-brand"><span className="brand-mark"><Archive size={22} /></span><span>MOVA <strong>Sauvegarde</strong></span></a><form className="request-form" onSubmit={createAccount}><p className="eyebrow">ÉTAPE 1 SUR 2</p><h1>Créer votre compte</h1><p className="muted">Votre compte ne donnera accès à aucune archive avant l'approbation de MOVA.</p><label>E-mail professionnel<input type="email" value={account.email} onChange={event => setAccount({ ...account, email: event.target.value })} required /></label><label>Mot de passe<div className="password-field"><input type={showAccountPassword ? 'text' : 'password'} minLength={8} value={account.password} onChange={event => setAccount({ ...account, password: event.target.value })} required /><button type="button" className="password-eye" onClick={() => setShowAccountPassword(current => !current)} aria-label={showAccountPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} title={showAccountPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>{showAccountPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div><small className="field-hint">Astuce : vous pouvez utiliser le numéro IFU de votre établissement comme mot de passe facile à retenir.</small></label><label>Confirmer le mot de passe<div className="password-field"><input type={showAccountConfirmPassword ? 'text' : 'password'} minLength={8} value={account.confirmPassword} onChange={event => setAccount({ ...account, confirmPassword: event.target.value })} required /><button type="button" className="password-eye" onClick={() => setShowAccountConfirmPassword(current => !current)} aria-label={showAccountConfirmPassword ? 'Masquer la confirmation du mot de passe' : 'Afficher la confirmation du mot de passe'} title={showAccountConfirmPassword ? 'Masquer la confirmation du mot de passe' : 'Afficher la confirmation du mot de passe'}>{showAccountConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>{status && <div className="error-message">{status}</div>}<button className="primary full" type="submit">Continuer vers la demande <ChevronRight size={17} /></button></form><style>{`.password-field{position:relative;display:flex;align-items:center}.password-field input{width:100%;padding-right:46px}.password-eye{position:absolute;right:10px;width:34px;height:34px;display:grid;place-items:center;border:0;background:transparent;color:#687386;cursor:pointer;border-radius:9px}.password-eye:hover{background:#f2f4f8;color:#1d4ed8}.password-eye:focus-visible{outline:2px solid #2563eb;outline-offset:1px}`}</style></div>
  return <div className="public-form-page"><a href="/" className="auth-brand"><span className="brand-mark"><Archive size={22} /></span><span>MOVA <strong>Sauvegarde</strong></span></a><form className="request-form" onSubmit={submit}><p className="eyebrow">ÉTAPE 2 SUR 2</p><h1>Demander l'accès</h1><p className="muted">Votre compte est créé. Complétez maintenant les informations de votre établissement.</p><div className="request-grid">{[['establishment_name', "Nom officiel de l'établissement"], ['city', 'Ville'], ['authorization_number', "Numéro d'autorisation"], ['ifu', 'IFU'], ['requester_name', 'Nom du responsable'], ['requester_role', 'Fonction'], ['phone', 'Téléphone']].map(([key, label]) => <label key={key}>{label}{key === 'authorization_number' ? <><input required value={form[key as keyof typeof form]} onChange={event => change(key, event.target.value)} placeholder="Ex. Arrêté N° 0078/MEMP/DC/SGM/2020" /><small className="field-hint">Numéro officiel de l'autorisation délivrée par le ministère pour ouvrir votre établissement.</small></> : <input required value={form[key as keyof typeof form]} onChange={event => change(key, event.target.value)} />}</label>)}</div><label>Adresse<textarea required value={form.address} onChange={event => change('address', event.target.value)} /></label>{status && <div className="error-message">{status}</div>}<button className="primary full" type="submit">Envoyer ma demande <ChevronRight size={17} /></button></form></div>
}

function PendingAccessRequest() {
  const [request, setRequest] = useState<any>(null); const [code, setCode] = useState(''); const [status, setStatus] = useState('')
  async function load() { if (!supabase) return; const { data } = await supabase.from('access_requests').select('*').order('created_at', { ascending: false }).limit(1).maybeSingle(); setRequest(data) }
  useEffect(() => { const initial = window.setTimeout(() => { void load() }, 0); const timer = window.setInterval(() => { void load() }, 4000); return () => { window.clearTimeout(initial); window.clearInterval(timer) } }, [])
  async function activate() { if (!supabase || !code) return; const { data: userData } = await supabase.auth.getUser(); const { data, error } = await supabase.functions.invoke('activate-access', { body: { code: code.trim().toUpperCase(), email: userData.user?.email, fullName: userData.user?.user_metadata?.full_name ?? request?.requester_name ?? 'Responsable', role: 'establishment_admin', password: 'existing-account' } }); if (error || data?.error) return setStatus(data?.error ?? error?.message ?? 'Activation impossible.'); window.location.href = '/' }
  return <div className="public-form-page centered"><a href="/" className="auth-brand"><span className="brand-mark"><Archive size={22} /></span><span>MOVA <strong>Sauvegarde</strong></span></a><div className="request-form pending-card"><p className="eyebrow">SUIVI DE VOTRE DEMANDE</p><h1>Votre demande est en cours de traitement</h1><p className="muted">La vérification de votre établissement prend généralement moins de 48h. Cette page se met à jour automatiquement, sans besoin de recharger.</p>{request?.status === 'active' && request.activation_code_display ? <div className="activation-delivery"><strong>Veuillez saisir ce code que nous venons de vous envoyer</strong><code>{request.activation_code_display}</code><input value={code} onChange={event => setCode(event.target.value.toUpperCase())} placeholder="MOVA-XXXX-2026" /><button className="primary full" onClick={activate}>Activer mon établissement <ChevronRight size={17} /></button></div> : <div className="pending-badge">Demande reçue · En attente de vérification MOVA</div>}{status && <div className="error-message">{status}</div>}</div></div>
}

function Activation() { const [form, setForm] = useState({ code: '', email: '', fullName: '', role: 'establishment_staff', password: '' }); const [status, setStatus] = useState(''); const change = (key: string, value: string) => setForm(current => ({ ...current, [key]: value })); async function check(e: React.FormEvent) { e.preventDefault(); if (!supabase) return setStatus('Configurez Supabase pour vérifier ce code.'); const { data, error } = await supabase.functions.invoke('activate-access', { body: form }); setStatus(error ? error.message : data?.error ?? 'Compte activé. Vous pouvez maintenant vous connecter.'); if (data?.ok) setTimeout(() => { window.location.href = '/connexion' }, 900) } return <div className="public-form-page centered"><a href="/" className="auth-brand"><span className="brand-mark"><Archive size={22} /></span><span>MOVA <strong>Sauvegarde</strong></span></a><form className="request-form" onSubmit={check}><p className="eyebrow">ACTIVATION SÉCURISÉE</p><h1>Activer mon accès</h1><p className="muted">Utilisez les informations transmises par MOVA pour créer votre compte.</p><label>Code d'activation<input value={form.code} onChange={e => change('code', e.target.value.toUpperCase())} placeholder="MOVA-XXXX-2026" required /></label><label>Nom complet<input value={form.fullName} onChange={e => change('fullName', e.target.value)} required /></label><label>E-mail professionnel<input type="email" value={form.email} onChange={e => change('email', e.target.value)} required /></label><label>Fonction<select value={form.role} onChange={e => change('role', e.target.value)}><option value="establishment_admin">Administrateur</option><option value="establishment_staff">Personnel</option></select></label><label>Mot de passe<input type="password" minLength={8} value={form.password} onChange={e => change('password', e.target.value)} required /></label>{status && <div className="success-message">{status}</div>}<button className="primary full" type="submit">Activer mon compte <ChevronRight size={17} /></button></form></div> }
function AdminV2() {
  const [tab, setTab] = useState<'establishments' | 'requests'>('establishments')
  const [establishments, setEstablishments] = useState<any[]>([])
  const [requests, setRequests] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [granting, setGranting] = useState(false)
  const [grantPlan, setGrantPlan] = useState<'small' | 'large' | null>(null)
  const [cashNote, setCashNote] = useState('')

  async function loadAdminData(showLoader = true) {
    if (!supabase) {
      setError('Supabase doit être configuré.')
      setLoading(false)
      return
    }

    if (showLoader) setLoading(true)
    else setRefreshing(true)
    setError('')

    try {
      const [establishmentsResult, requestsResult] = await Promise.all([
        supabase.rpc('admin_list_establishments'),
        supabase.from('access_requests').select('*').order('created_at', { ascending: false }),
      ])

      if (establishmentsResult.error) throw establishmentsResult.error
      if (requestsResult.error) throw requestsResult.error

      const rows = establishmentsResult.data ?? []
      setEstablishments(rows)
      setRequests(requestsResult.data ?? [])

      if (selected) {
        const updated = rows.find((item: any) => item.id === selected.id)
        setSelected(updated ?? null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les données administrateur.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void loadAdminData()
  }, [])

  const filteredEstablishments = establishments.filter(item => {
    const needle = search.trim().toLowerCase()
    if (!needle) return true
    return [
      item.official_name,
      item.professional_email,
      item.city,
      item.country,
      item.subscription_plan,
      item.subscription_status,
      item.payment_provider,
    ].some(value => String(value ?? '').toLowerCase().includes(needle))
  })

  function openEstablishment(item: any) {
    setSelected(item)
    setGrantPlan(null)
    setCashNote('')
    setMessage('')
    setError('')
  }

  async function grantCashSubscription() {
    if (!supabase || !selected || !grantPlan) return
    setGranting(true)
    setMessage('')
    setError('')

    try {
      const { data, error: rpcError } = await supabase.rpc('admin_grant_cash_subscription', {
        target_establishment: selected.id,
        target_plan: grantPlan,
        payment_note: cashNote.trim() || null,
      })

      if (rpcError) throw rpcError

      setMessage(
        `Abonnement ${grantPlan === 'large' ? 'Grande échelle' : 'Petite échelle'} activé. ` +
        `Expiration : ${new Date(data.end_date).toLocaleDateString('fr-FR')}.`,
      )
      setGrantPlan(null)
      setCashNote('')
      await loadAdminData(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible d’activer l’abonnement.')
    } finally {
      setGranting(false)
    }
  }

  async function review(requestId: string, decision: string) {
    if (!supabase) return
    setMessage('')
    setError('')
    const { data, error: reviewError } = await supabase.functions.invoke('review-access-request', {
      body: { requestId, decision },
    })
    if (reviewError) {
      setError(reviewError.message)
      return
    }
    setMessage(data?.activation_code ? `Code généré : ${data.activation_code}` : 'Demande traitée.')
    await loadAdminData(false)
  }

  function subscriptionLabel(item: any) {
    if (!item.subscription_status) return 'Aucun abonnement'
    if (item.subscription_status === 'active') return item.subscription_plan === 'large' ? 'Grande échelle · Actif' : 'Petite échelle · Actif'
    return `${item.subscription_plan === 'large' ? 'Grande échelle' : 'Petite échelle'} · Expiré`
  }

  return <div className="admin-page">
    <style>{`
      .admin-center-tabs { display:flex; gap:8px; margin:0 0 20px; flex-wrap:wrap; }
      .admin-center-tab { border:1px solid #e2e8f0; background:#fff; color:#536074; border-radius:12px; padding:10px 15px; font-weight:700; cursor:pointer; }
      .admin-center-tab.active { background:#14233a; color:#fff; border-color:#14233a; }
      .admin-toolbar { display:flex; gap:12px; align-items:center; justify-content:space-between; margin-bottom:18px; flex-wrap:wrap; }
      .admin-search { flex:1; min-width:240px; display:flex; align-items:center; gap:9px; background:#fff; border:1px solid #e3e8ef; border-radius:13px; padding:0 13px; }
      .admin-search input { width:100%; border:0; outline:0; background:transparent; min-height:44px; }
      .admin-refresh { min-height:44px; }
      .admin-establishment-list { display:grid; gap:12px; }
      .admin-establishment-row { width:100%; text-align:left; border:1px solid #e4e9f1; background:#fff; border-radius:16px; padding:17px 18px; display:grid; grid-template-columns:1fr auto; gap:15px; align-items:center; cursor:pointer; transition:.18s ease; }
      .admin-establishment-row:hover { border-color:#bfd0ee; transform:translateY(-1px); box-shadow:0 10px 28px rgba(24,39,75,.07); }
      .admin-establishment-main { display:grid; gap:5px; }
      .admin-establishment-main strong { color:#17263d; font-size:16px; }
      .admin-establishment-main small { color:#758094; }
      .admin-establishment-meta { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
      .admin-subscription-pill { display:inline-flex; align-items:center; border-radius:999px; padding:6px 9px; font-size:11px; font-weight:800; background:#f1f5f9; color:#64748b; }
      .admin-subscription-pill.active { background:#eaf7ef; color:#138a4b; }
      .admin-subscription-pill.expired { background:#fff1f2; color:#be123c; }
      .admin-days { font-size:12px; color:#64748b; font-weight:700; }
      .admin-detail-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin:18px 0; }
      .admin-detail-item { background:#f8fafc; border:1px solid #e7edf4; border-radius:13px; padding:13px; }
      .admin-detail-item small { display:block; color:#7b8494; margin-bottom:5px; }
      .admin-detail-item strong { color:#1e2b40; }
      .admin-plan-actions { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:18px; }
      .admin-plan-button { min-height:74px; display:flex; flex-direction:column; align-items:flex-start; justify-content:center; gap:4px; text-align:left; }
      .admin-plan-button strong { font-size:15px; }
      .admin-plan-button small { opacity:.75; }
      .admin-cash-note { margin-top:14px; }
      .admin-cash-note textarea { width:100%; min-height:78px; resize:vertical; border:1px solid #dfe5ed; border-radius:12px; padding:11px 12px; font:inherit; }
      .admin-modal-actions { display:flex; gap:10px; justify-content:flex-end; margin-top:18px; flex-wrap:wrap; }
      @media (max-width:700px) { .admin-establishment-row { grid-template-columns:1fr; } .admin-detail-grid, .admin-plan-actions { grid-template-columns:1fr; } }
    `}</style>

    <header className="topbar">
      <a href="/" className="auth-brand"><span className="brand-mark"><Archive size={20} /></span><span>MOVA <strong>Administration</strong></span></a>
      <a className="public-login" href="/">Retour au site <ChevronRight size={16} /></a>
    </header>

    <main className="page-wrap">
      <PageTitle eyebrow="ESPACE MOVA" title="Administration centrale" description="Gérez les établissements, leurs abonnements et les demandes d'accès sans modifier leur espace de travail." />

      {message && <div className="success-message">{message}</div>}
      {error && <div className="error-message">{error}</div>}

      <div className="admin-center-tabs">
        <button className={`admin-center-tab ${tab === 'establishments' ? 'active' : ''}`} onClick={() => setTab('establishments')}>Établissements ({establishments.length})</button>
        <button className={`admin-center-tab ${tab === 'requests' ? 'active' : ''}`} onClick={() => setTab('requests')}>Demandes d'accès ({requests.length})</button>
      </div>

      {tab === 'establishments' && <>
        <div className="admin-toolbar">
          <div className="admin-search"><Search size={17} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Rechercher un établissement, une ville, un abonnement…" /></div>
          <button className="secondary admin-refresh" onClick={() => void loadAdminData(false)} disabled={refreshing}>{refreshing ? 'Actualisation…' : 'Actualiser'}</button>
        </div>

        {loading ? <div className="empty-state"><Building2 size={27} /><h2>Chargement des établissements…</h2><p>Les données administratives arrivent.</p></div>
          : filteredEstablishments.length === 0 ? <div className="empty-state"><Building2 size={27} /><h2>Aucun établissement</h2><p>Aucun établissement ne correspond à votre recherche.</p></div>
          : <div className="admin-establishment-list">
              {filteredEstablishments.map(item => <button className="admin-establishment-row" key={item.id} onClick={() => openEstablishment(item)}>
                <span className="admin-establishment-main">
                  <strong>{item.official_name || 'Établissement sans nom'}</strong>
                  <small>{item.city || 'Ville non renseignée'} · {item.professional_email || 'E-mail non renseigné'}</small>
                  <span className="admin-establishment-meta">
                    <span className={`admin-subscription-pill ${item.subscription_status === 'active' ? 'active' : item.subscription_status ? 'expired' : ''}`}>{subscriptionLabel(item)}</span>
                    {item.subscription_end_date && <span className="admin-days">Expiration : {new Date(item.subscription_end_date).toLocaleDateString('fr-FR')}</span>}
                  </span>
                </span>
                <ChevronRight size={20} />
              </button>)}
            </div>}
      </>}

      {tab === 'requests' && <div className="admin-list">
        {requests.length === 0 ? <div className="empty-state"><Building2 size={27} /><h2>Aucune demande</h2><p>Les nouvelles demandes apparaîtront ici.</p></div> : requests.map(request => <div className="admin-row" key={request.id}>
          <div>
            <strong>{request.establishment_name}</strong>
            <small>{request.city} · {request.requester_name} · {request.email}</small>
            <small>Statut : {request.status}</small>
            <div className="request-details">
              <small><b>IFU :</b> {request.ifu || 'Non renseigné'}</small>
              <small><b>Autorisation :</b> {request.authorization_number || 'Non renseigné'}</small>
            </div>
          </div>
          <div className="admin-actions">
            {request.status === 'pending' && <>
              <button className="secondary" onClick={() => void review(request.id, 'reject')}>Refuser</button>
              <button className="primary" onClick={() => void review(request.id, 'approve')}>Approuver</button>
            </>}
          </div>
        </div>)}
      </div>}
    </main>

    {selected && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Gestion de l'établissement">
      <div className="modal-card" style={{ width: 'min(720px, 94vw)', maxWidth: 720 }}>
        <button className="modal-close" onClick={() => setSelected(null)} aria-label="Fermer"><X size={18} /></button>
        <p className="eyebrow">GESTION DE L'ÉTABLISSEMENT</p>
        <h2>{selected.official_name || 'Établissement sans nom'}</h2>
        <p className="muted">{selected.city || 'Ville non renseignée'} · {selected.professional_email || 'E-mail non renseigné'}</p>

        <div className="admin-detail-grid">
          <div className="admin-detail-item"><small>Statut établissement</small><strong>{selected.status || 'Non renseigné'}</strong></div>
          <div className="admin-detail-item"><small>Abonnement</small><strong>{subscriptionLabel(selected)}</strong></div>
          <div className="admin-detail-item"><small>Date de début</small><strong>{selected.subscription_start_date ? new Date(selected.subscription_start_date).toLocaleDateString('fr-FR') : '—'}</strong></div>
          <div className="admin-detail-item"><small>Date d'expiration</small><strong>{selected.subscription_end_date ? new Date(selected.subscription_end_date).toLocaleDateString('fr-FR') : '—'}</strong></div>
          <div className="admin-detail-item"><small>Mode de paiement</small><strong>{selected.payment_provider === 'admin_cash' ? 'Paiement comptant' : selected.payment_provider === 'fedapay' ? 'FedaPay' : '—'}</strong></div>
          <div className="admin-detail-item"><small>Jours restants</small><strong>{selected.days_remaining != null ? `${selected.days_remaining} jour${selected.days_remaining > 1 ? 's' : ''}` : '—'}</strong></div>
        </div>

        <div className="admin-cash-note">
          <label>Note du paiement comptant (facultatif)
            <textarea value={cashNote} onChange={event => setCashNote(event.target.value)} placeholder="Ex. Reçu caisse n° 2026-014, paiement reçu par l'administration…" />
          </label>
        </div>

        <div className="admin-plan-actions">
          <button className="secondary admin-plan-button" onClick={() => setGrantPlan('small')} disabled={granting}>
            <strong>Petite échelle · 17 000 FCFA</strong>
            <small>Activer pour 12 mois</small>
          </button>
          <button className="primary admin-plan-button" onClick={() => setGrantPlan('large')} disabled={granting}>
            <strong>Grande échelle · 44 000 FCFA</strong>
            <small>Activer pour 12 mois</small>
          </button>
        </div>

        <p className="field-hint" style={{ marginTop: 14 }}>Si un abonnement actif existe déjà, les 12 nouveaux mois sont ajoutés à sa date d'expiration, comme pour un paiement FedaPay.</p>
      </div>
    </div>}

    {grantPlan && selected && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Confirmation du paiement comptant">
      <div className="modal-card" style={{ width: 'min(500px, 94vw)', maxWidth: 500 }}>
        <button className="modal-close" onClick={() => setGrantPlan(null)} aria-label="Fermer"><X size={18} /></button>
        <p className="eyebrow">PAIEMENT COMPTANT</p>
        <h2>Confirmer l'activation</h2>
        <p className="muted">{selected.official_name}</p>
        <div className="admin-detail-grid">
          <div className="admin-detail-item"><small>Formule</small><strong>{grantPlan === 'large' ? 'Grande échelle' : 'Petite échelle'}</strong></div>
          <div className="admin-detail-item"><small>Montant reçu</small><strong>{grantPlan === 'large' ? '44 000 FCFA' : '17 000 FCFA'}</strong></div>
        </div>
        <p className="muted">Cette opération active immédiatement l'abonnement, crée l'enregistrement de paiement comptant et laisse une trace dans l'historique administrateur.</p>
        <div className="admin-modal-actions">
          <button className="secondary" onClick={() => setGrantPlan(null)} disabled={granting}>Annuler</button>
          <button className="primary" onClick={() => void grantCashSubscription()} disabled={granting}>{granting ? 'Activation…' : 'Confirmer le paiement reçu'}</button>
        </div>
      </div>
    </div>}
  </div>
}
function Auth({ email, setEmail, password, setPassword, message, onSubmit }: { email: string; setEmail: (v: string) => void; password: string; setPassword: (v: string) => void; message: string; onSubmit: (e: React.FormEvent) => void }) { const [showPassword, setShowPassword] = useState(false); return <div className="auth-page"><div className="auth-panel"><div className="auth-brand"><span className="brand-mark"><Archive size={22} /></span><span>MOVA <strong>Sauvegarde</strong></span></div><div className="auth-copy"><p className="eyebrow">ESPACE SÉCURISÉ</p><h1>Vos archives scolaires,<br /><em>toujours à portée de main.</em></h1><p>Conservez, organisez et retrouvez les bulletins de votre établissement en toute simplicité.</p></div><div className="auth-footer"><ShieldCheck size={16} /> Données protégées et hébergées de façon sécurisée</div></div><form className="auth-form" onSubmit={onSubmit}><p className="eyebrow">BIENVENUE</p><h2>Se connecter</h2><p className="muted">Accédez à l'espace de votre établissement.</p><label>Email professionnel<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="vous@etablissement.bj" required /></label><label>Mot de passe<div className="password-field"><input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Votre mot de passe" required /><button type="button" className="password-eye" onClick={() => setShowPassword(current => !current)} aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} title={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>{message && <div className="error-message">{message}</div>}<button className="primary full" type="submit">Ouvrir ma session <ChevronRight size={17} /></button><button className="text-button" type="button">Mot de passe oublié ?</button><div className="switch-auth">Votre établissement n'a pas encore d'accès ? <a href="/demande-acces">Faire une demande</a></div><a href="/" className="secondary auth-home-link">Retour à la page d'accueil <ChevronRight size={16} /></a>{!supabase && <div className="config-note">Renseignez les variables Supabase dans <strong>.env.local</strong> pour activer la connexion.</div>}</form><style>{`.password-field{position:relative;display:flex;align-items:center}.password-field input{width:100%;padding-right:46px}.password-eye{position:absolute;right:10px;width:34px;height:34px;display:grid;place-items:center;border:0;background:transparent;color:#687386;cursor:pointer;border-radius:9px}.password-eye:hover{background:#f2f4f8;color:#1d4ed8}.password-eye:focus-visible{outline:2px solid #2563eb;outline-offset:1px}`}</style></div> }
function PageTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) { return <div className="page-title"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{description && <p className="muted">{description}</p>}</div> }
function useSubscription() { const [subscription, setSubscription] = useState<{ plan: string; end_date: string; status: string; start_date: string } | null>(null); useEffect(() => { if (!supabase) return; supabase.from('profiles').select('establishment_id').single().then(async ({ data: profile }) => { if (profile?.establishment_id) await supabase!.rpc('refresh_subscription_status', { target_establishment: profile.establishment_id }); const { data } = await supabase!.from('subscriptions').select('plan, start_date, end_date, status').order('end_date', { ascending: false }).limit(1).maybeSingle(); setSubscription(data) }) }, []); return subscription }
function Dashboard({ stats, go, email }: { stats: typeof defaultStats; go: (v: View) => void; email: string }) { const subscription = useSubscription(); const [now] = useState(() => Date.now()); const expiry = subscription ? new Date(subscription.end_date).toLocaleDateString('fr-FR') : null; const active = subscription?.status === 'active' && new Date(subscription.end_date).getTime() > now; const confirmation = typeof window !== 'undefined' ? sessionStorage.getItem('mova_payment_confirmation') : null; useEffect(() => { if (confirmation) sessionStorage.removeItem('mova_payment_confirmation') }, [confirmation]); return <><PageTitle eyebrow="VUE D'ENSEMBLE" title={`Bonjour, ${email.split('@')[0]}.`} description="Que puis-je faire pour vous aujourd'hui ?" />{confirmation && <div className="success-message dashboard-confirmation">{confirmation}</div>}<section className="hero-strip"><div><span className="status-dot" /> {subscription ? `Abonnement ${active ? 'actif' : 'expiré'}` : 'Aucun abonnement actif'} {expiry && <><span className="separator" /> Expire le {expiry}</>}</div><button onClick={() => go('subscription')}>Voir mon abonnement <ChevronRight size={16} /></button></section><div className="stat-grid"><Stat label="Bulletins archivés" value={stats.bulletins || '—'} icon={FileText} tone="blue" /><Stat label="Élèves enregistrés" value={stats.students || '—'} icon={Users} tone="gold" /><Stat label="Années scolaires" value={stats.years || '—'} icon={Archive} tone="green" /></div><div className="section-heading"><h2>Que souhaitez-vous faire ?</h2><p className="muted">Les actions essentielles de votre espace.</p></div><div className="action-grid"><Action icon={FilePlus2} title="Ajouter des bulletins" text="Importez vos nouveaux documents" onClick={() => go('upload')} /><Action icon={Archive} title="Consulter les archives" text="Retrouvez un bulletin rapidement" onClick={() => go('archives')} /><Action icon={Search} title="Rechercher un bulletin" text="Par classe et année scolaire" onClick={() => go('search')} /></div><section className="notice"><div className="notice-icon"><Bell size={18} /></div><div><strong>{subscription ? (active ? 'Rappel important' : 'Abonnement expiré') : 'Aucun abonnement actif'}</strong><p>{subscription ? (active ? `Votre abonnement expire le ${expiry}. Pensez à le renouveler.` : 'Vos archives restent accessibles. Renouvelez pour continuer vos dépôts.') : 'Souscrivez une formule pour continuer à archiver vos bulletins.'}</p></div><button onClick={() => go('subscription')}>Voir les formules</button></section></> }
function Stat({ label, value, icon: Icon, tone }: { label: string; value: string | number; icon: typeof FileText; tone: string }) { return <div className="stat-card"><span className={`stat-icon ${tone}`}><Icon size={19} /></span><span><small>{label}</small><strong>{value}</strong></span></div> }
function Action({ icon: Icon, title, text, onClick }: { icon: typeof FileText; title: string; text: string; onClick: () => void }) { return <button className="action-card" onClick={onClick}><span className="action-icon"><Icon size={21} /></span><span><strong>{title}</strong><small>{text}</small></span><ChevronRight size={18} className="action-arrow" /></button> }
function Archives() {
  type Bulletin = {
    id: string
    establishment_id: string
    file_path: string
    original_filename: string
    created_at: string
    classes: { name: string } | null
    school_years: { label: string } | null
    periods: { name: string } | null
  }

  type ClassLocation = { levelKey: string; levelLabel: string; letter: string }

  const [bulletins, setBulletins] = useState<Bulletin[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [yearFilter, setYearFilter] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [periodFilter, setPeriodFilter] = useState('')
  const [openLevel, setOpenLevel] = useState<string | null>(null)
  const [openYear, setOpenYear] = useState<string | null>(null)
  const [openLetter, setOpenLetter] = useState<string | null>(null)
  const [openPeriod, setOpenPeriod] = useState<string | null>(null)
  const [selected, setSelected] = useState<Bulletin | null>(null)
  const [fileUrl, setFileUrl] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<Bulletin | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  // Les écritures peuvent avoir été saisies avec "3ème", "3eme", "3 ème"
  // ou des espaces différents. On utilise une clé canonique pour qu'une
  // même session ne soit JAMAIS dupliquée dans la galerie.
  function canonical(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/\s*e\s*m\s*e\b/g, 'eme')
      .trim()
  }

  function displayLevel(value: string) {
    const clean = value.trim().replace(/\s+/g, ' ')
    if (/^\d+\s*eme$/i.test(canonical(clean))) {
      return canonical(clean).replace(/\s+/g, '').replace(/eme$/i, 'ème')
    }
    return clean
  }

  function parseClass(className: string): ClassLocation {
    const normalized = className.trim().replace(/\s+/g, ' ')
    const match = normalized.match(/^(.*?)[\s-]+([A-Za-zÀ-ÿ])$/u)
    if (match) {
      const rawLevel = match[1].trim()
      return {
        levelKey: canonical(rawLevel),
        levelLabel: displayLevel(rawLevel),
        letter: match[2].toUpperCase(),
      }
    }

    // Si une ancienne donnée n'a pas de lettre, elle reste visible au lieu
    // de provoquer une page vide.
    return {
      levelKey: canonical(normalized || 'Classe non renseignée'),
      levelLabel: displayLevel(normalized || 'Classe non renseignée'),
      letter: 'Autre',
    }
  }

  // Même ordre que dans le formulaire d'ajout, pour que "1er trimestre"
  // apparaisse toujours avant "2e trimestre", etc.
  const PERIOD_ORDER = ['1er trimestre', '2e trimestre', '3e trimestre', '1er semestre', '2e semestre', 'Bulletin annuel']
  function periodSortIndex(name: string) {
    const index = PERIOD_ORDER.indexOf(name)
    return index === -1 ? PERIOD_ORDER.length : index
  }

  async function loadArchives(showLoader = true) {
    if (!supabase) {
      setError('Supabase doit être configuré pour afficher les archives.')
      setLoading(false)
      return
    }
    if (showLoader) setLoading(true)
    setError('')
    try {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('establishment_id')
        .single()
      if (profileError) throw profileError

      const establishmentId = profile?.establishment_id
      if (!establishmentId) {
        setBulletins([])
        setError('Établissement introuvable pour ce compte.')
        return
      }

      const all: Bulletin[] = []
      const pageSize = 1000

      for (let from = 0; ; from += pageSize) {
        const { data, error: queryError } = await supabase
          .from('bulletins')
          .select('id, establishment_id, file_path, original_filename, created_at, classes!inner(name), school_years!inner(label), periods!inner(name)')
          .eq('establishment_id', establishmentId)
          .order('created_at', { ascending: false })
          .range(from, from + pageSize - 1)

        if (queryError) throw queryError
        const rows = (data ?? []) as unknown as Bulletin[]
        all.push(...rows)
        if (rows.length < pageSize) break
      }

      setBulletins(all)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible de charger les archives.')
      setBulletins([])
    } finally {
      if (showLoader) setLoading(false)
    }
  }

  useEffect(() => {
    let channel: any = null
    let cancelled = false

    async function startRealtime() {
      await loadArchives(true)
      if (cancelled || !supabase) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('establishment_id')
        .single()
      if (!profile?.establishment_id) return

      channel = supabase
        .channel(`mova-archives-${profile.establishment_id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'bulletins',
            filter: `establishment_id=eq.${profile.establishment_id}`,
          },
          () => { void loadArchives(false) },
        )
        .subscribe()
    }

    void startRealtime()
    return () => {
      cancelled = true
      if (channel && supabase) void supabase.removeChannel(channel)
    }
  }, [])

  const filtered = bulletins.filter(item => {
    const className = item.classes?.name ?? ''
    const year = item.school_years?.label ?? ''
    const period = item.periods?.name ?? ''
    const classNeedle = canonical(classFilter)
    const yearNeedle = canonical(yearFilter)
    return (!classNeedle || canonical(className).includes(classNeedle))
      && (!yearNeedle || canonical(year).includes(yearNeedle))
      && (!periodFilter || period === periodFilter)
  })

  // Une seule session par niveau canonique :
  // "3ème A" + "3eme B" => une seule session "3ème".
  const levelMap = new Map<string, string>()
  filtered.forEach(item => {
    const parsed = parseClass(item.classes?.name ?? '')
    if (!levelMap.has(parsed.levelKey)) levelMap.set(parsed.levelKey, parsed.levelLabel)
  })

  const levels = Array.from(levelMap.entries())
    .sort((a, b) => a[1].localeCompare(b[1], 'fr', { numeric: true }))

  const years = openLevel
    ? Array.from(new Set(
        filtered
          .filter(item => parseClass(item.classes?.name ?? '').levelKey === openLevel)
          .map(item => item.school_years?.label ?? 'Année non renseignée'),
      )).sort((a, b) => b.localeCompare(a, 'fr', { numeric: true }))
    : []

  const letters = openLevel && openYear
    ? Array.from(new Set(
        filtered
          .filter(item => {
            const parsed = parseClass(item.classes?.name ?? '')
            return parsed.levelKey === openLevel
              && (item.school_years?.label ?? 'Année non renseignée') === openYear
          })
          .map(item => parseClass(item.classes?.name ?? '').letter),
      )).sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }))
    : []

  // Ne sont listées que les périodes réellement créées par l'établissement
  // pour cette salle (aucune période "vide" n'est proposée).
  const periods = openLevel && openYear && openLetter
    ? Array.from(new Set(
        filtered
          .filter(item => {
            const parsed = parseClass(item.classes?.name ?? '')
            return parsed.levelKey === openLevel
              && (item.school_years?.label ?? 'Année non renseignée') === openYear
              && parsed.letter === openLetter
          })
          .map(item => item.periods?.name ?? 'Période non renseignée'),
      )).sort((a, b) => periodSortIndex(a) - periodSortIndex(b))
    : []

  const visibleBulletins = openLevel && openYear && openLetter && openPeriod
    ? filtered.filter(item => {
        const parsed = parseClass(item.classes?.name ?? '')
        return parsed.levelKey === openLevel
          && (item.school_years?.label ?? 'Année non renseignée') === openYear
          && parsed.letter === openLetter
          && (item.periods?.name ?? 'Période non renseignée') === openPeriod
      })
    : []

  const currentLevelLabel = openLevel ? (levelMap.get(openLevel) ?? openLevel) : ''

  function goToRoot() {
    setOpenLevel(null)
    setOpenYear(null)
    setOpenLetter(null)
    setOpenPeriod(null)
  }

  function goToLevel(levelKey: string) {
    setOpenLevel(levelKey)
    setOpenYear(null)
    setOpenLetter(null)
    setOpenPeriod(null)
  }

  function goToYear(year: string) {
    setOpenYear(year)
    setOpenLetter(null)
    setOpenPeriod(null)
  }

  function goToLetter(letter: string) {
    setOpenLetter(letter)
    setOpenPeriod(null)
  }

  function goToPeriod(period: string) {
    setOpenPeriod(period)
  }

  async function openBulletin(result: Bulletin) {
    if (!supabase) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('establishment_id')
      .single()
    const establishmentId = profile?.establishment_id

    if (
      !establishmentId
      || result.establishment_id !== establishmentId
      || !result.file_path.startsWith(`${establishmentId}/`)
    ) {
      setError('Accès refusé à ce bulletin.')
      return
    }

    const { data, error: urlError } = await supabase.storage
      .from('bulletins')
      .createSignedUrl(result.file_path, 600)

    if (urlError || !data?.signedUrl) {
      setError(urlError?.message ?? 'Impossible d’ouvrir ce bulletin.')
      return
    }

    setSelected(result)
    setFileUrl(data.signedUrl)
  }

  function closeViewer() {
    setSelected(null)
    setFileUrl('')
  }

  function requestDelete(target: Bulletin) {
    setDeleteError('')
    setConfirmDelete(target)
  }

  async function confirmAndDelete() {
    if (!supabase || !confirmDelete || deleting) return
    setDeleting(true)
    setDeleteError('')
    const target = confirmDelete
    try {
      // On retire d'abord la ligne (c'est elle qui donne accès au bulletin) : si cette étape
      // réussit, le bulletin disparaît immédiatement des archives même si le fichier physique
      // met plus de temps à être supprimé.
      const { error: dbError } = await supabase.from('bulletins').delete().eq('id', target.id)
      if (dbError) throw dbError
      // Suppression du fichier réel dans le stockage. Best-effort : un échec ici ne doit pas
      // faire réapparaître le bulletin, il resterait juste un fichier orphelin invisible.
      await supabase.storage.from('bulletins').remove([target.file_path]).catch(() => {})

      setBulletins(current => current.filter(item => item.id !== target.id))
      if (selected?.id === target.id) closeViewer()
      setConfirmDelete(null)
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Suppression impossible. Réessayez.')
    } finally {
      setDeleting(false)
    }
  }

  return <>
    <style>{`
      .archive-gallery-toolbar { display:grid; gap:14px; margin-bottom:22px; }
      .archive-gallery-breadcrumb { display:flex; align-items:center; gap:8px; flex-wrap:wrap; min-height:34px; color:#7b8494; font-size:13px; }
      .archive-gallery-breadcrumb button { border:0; background:none; color:#2563eb; padding:3px 0; cursor:pointer; font:inherit; }
      .archive-gallery-breadcrumb button:hover { text-decoration:underline; }
      .archive-gallery-breadcrumb strong { color:#273249; }
      .archive-gallery-filters { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
      .archive-gallery-back { width:max-content; display:inline-flex; align-items:center; gap:7px; border:0; background:none; color:#2563eb; font-weight:700; padding:0; cursor:pointer; }
      .archive-gallery-heading { display:flex; justify-content:space-between; align-items:flex-end; gap:16px; margin-bottom:16px; }
      .archive-gallery-heading h2 { margin:4px 0 0; }
      .archive-gallery-heading > span { color:#7b8494; font-size:13px; }
      .archive-gallery { display:grid; gap:16px; }
      .archive-gallery-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:15px; }
      .archive-level-card, .archive-year-card, .archive-letter-card, .archive-result-card { width:100%; border:1px solid #e5e9f0; background:#fff; border-radius:18px; box-shadow:0 10px 30px rgba(24,39,75,.06); cursor:pointer; text-align:left; transition:transform .2s ease, box-shadow .2s ease, border-color .2s ease; }
      .archive-level-card, .archive-year-card, .archive-letter-card { min-height:104px; display:flex; align-items:center; gap:14px; padding:19px; }
      .archive-level-card:hover, .archive-year-card:hover, .archive-letter-card:hover, .archive-result-card:hover { transform:translateY(-3px); border-color:#c8d7f3; box-shadow:0 16px 38px rgba(24,39,75,.1); }
      .archive-folder-icon, .archive-year-icon, .archive-letter-icon, .archive-result-icon { width:48px; height:48px; flex:0 0 48px; display:grid; place-items:center; border-radius:14px; background:#eef4ff; color:#2563eb; }
      .archive-letter-icon { font-weight:900; font-size:20px; }
      .archive-card-copy { min-width:0; flex:1; display:flex; flex-direction:column; gap:5px; }
      .archive-card-copy strong { color:#273249; font-size:16px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .archive-card-copy small { color:#7a8494; }
      .archive-card-arrow { color:#9aa3b1; flex:0 0 auto; }
      .archive-gallery-list { display:grid; gap:10px; }
      .archive-result-card { display:flex; align-items:stretch; gap:0; padding:0; cursor:default; }
      .archive-result-open { flex:1; min-width:0; display:flex; align-items:center; gap:12px; padding:14px 16px; border:0; background:none; text-align:left; cursor:pointer; font:inherit; color:inherit; }
      .archive-result-card .archive-card-copy strong { font-size:14px; }
      .archive-result-open > svg:last-child { color:#2563eb; flex:0 0 auto; }
      .archive-delete-btn { flex:0 0 auto; width:44px; align-self:stretch; display:grid; place-items:center; border:0; border-left:1px solid #eef1f6; background:none; color:#9aa3b1; cursor:pointer; transition:background .15s ease, color .15s ease; }
      .archive-delete-btn:hover { background:#fdeaea; color:#c62828; }
      .archive-delete-btn:focus-visible { outline:2px solid #2563eb; outline-offset:-2px; }
      .delete-confirm-body { display:grid; gap:6px; margin:6px 0 18px; }
      .delete-confirm-body strong { color:#273249; }
      .delete-confirm-body small { color:#7b8494; }
      .delete-actions { display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap; }
      .delete-danger-button { display:inline-flex; align-items:center; gap:7px; border:0; border-radius:10px; background:#c62828; color:#fff; font:inherit; font-weight:700; padding:11px 18px; cursor:pointer; }
      .delete-danger-button:disabled { opacity:.6; cursor:wait; }
      .archive-loading { display:flex; align-items:center; gap:9px; color:#64748b; font-size:13px; margin:10px 0 15px; }
      @media (max-width:760px) { .archive-gallery-filters, .archive-gallery-grid { grid-template-columns:1fr; } .archive-gallery-heading { align-items:flex-start; flex-direction:column; } }
    `}</style>

    <PageTitle
      eyebrow="CONSULTATION"
      title="Vos archives"
      description={`${bulletins.length} bulletin${bulletins.length > 1 ? 's' : ''} archivé${bulletins.length > 1 ? 's' : ''} dans votre espace.`}
    />

    <div className="archive-gallery-toolbar">
      <div className="archive-gallery-breadcrumb">
        <button onClick={goToRoot}>Archives</button>
        {openLevel && <><span>›</span><button onClick={() => { setOpenYear(null); setOpenLetter(null); setOpenPeriod(null) }}>{currentLevelLabel}</button></>}
        {openYear && <><span>›</span><button onClick={() => { setOpenLetter(null); setOpenPeriod(null) }}>{openYear}</button></>}
        {openLetter && <><span>›</span><button onClick={() => setOpenPeriod(null)}>Classe {currentLevelLabel} {openLetter}</button></>}
        {openPeriod && <><span>›</span><strong>{openPeriod}</strong></>}
      </div>

      <div className="archive-gallery-filters">
        <input
          value={classFilter}
          onChange={e => { setClassFilter(e.target.value); goToRoot() }}
          placeholder="Classe · 3ème A"
          autoComplete="off"
        />
        <input
          value={yearFilter}
          onChange={e => { setYearFilter(e.target.value); goToRoot() }}
          placeholder="Année scolaire · 2026-2027"
          autoComplete="off"
        />
        <select value={periodFilter} onChange={e => { setPeriodFilter(e.target.value); goToRoot() }}>
          <option value="">Toutes les périodes</option>
          <option>1er trimestre</option><option>2e trimestre</option><option>3e trimestre</option>
          <option>1er semestre</option><option>2e semestre</option><option>Bulletin annuel</option>
        </select>
      </div>
    </div>

    {error && <div className="error-message">{error}</div>}
    {loading && <div className="archive-loading"><span className="search-spinner" /> Chargement de vos archives…</div>}

    {!loading && bulletins.length === 0 && !error && (
      <div className="empty-state">
        <Archive size={28} />
        <h2>Aucun bulletin archivé</h2>
        <p>Les bulletins publiés par votre établissement apparaîtront automatiquement dans cette galerie.</p>
      </div>
    )}

    {!loading && bulletins.length > 0 && filtered.length === 0 && (
      <div className="empty-state">
        <Archive size={28} />
        <h2>Aucun bulletin trouvé</h2>
        <p>Modifiez les filtres pour afficher les archives correspondantes.</p>
      </div>
    )}

    {!loading && filtered.length > 0 && !openLevel && (
      <div className="archive-gallery-grid">
        {levels.map(([levelKey, levelLabel]) => {
          const count = filtered.filter(b => parseClass(b.classes?.name ?? '').levelKey === levelKey).length
          return <button className="archive-level-card" key={levelKey} onClick={() => goToLevel(levelKey)}>
            <span className="archive-folder-icon"><Archive size={23} /></span>
            <span className="archive-card-copy">
              <strong>{levelLabel}</strong>
              <small>{count} bulletin{count > 1 ? 's' : ''}</small>
            </span>
            <ChevronRight size={19} className="archive-card-arrow" />
          </button>
        })}
      </div>
    )}

    {!loading && filtered.length > 0 && openLevel && !openYear && (
      <section className="archive-gallery">
        <button className="archive-gallery-back" onClick={goToRoot}><ChevronLeft size={17} /> Retour aux niveaux</button>
        <div className="archive-gallery-heading">
          <div><p className="eyebrow">NIVEAU</p><h2>{currentLevelLabel}</h2></div>
          <span>{years.length} année{years.length > 1 ? 's' : ''}</span>
        </div>
        <div className="archive-gallery-grid">
          {years.map(item => {
            const count = filtered.filter(b => {
              const parsed = parseClass(b.classes?.name ?? '')
              return parsed.levelKey === openLevel && (b.school_years?.label ?? 'Année non renseignée') === item
            }).length
            return <button className="archive-year-card" key={item} onClick={() => goToYear(item)}>
              <span className="archive-year-icon"><Archive size={21} /></span>
              <span className="archive-card-copy"><strong>{item}</strong><small>{count} bulletin{count > 1 ? 's' : ''}</small></span>
              <ChevronRight size={18} className="archive-card-arrow" />
            </button>
          })}
        </div>
      </section>
    )}

    {!loading && filtered.length > 0 && openLevel && openYear && !openLetter && (
      <section className="archive-gallery">
        <button className="archive-gallery-back" onClick={() => setOpenYear(null)}><ChevronLeft size={17} /> Retour aux années scolaires</button>
        <div className="archive-gallery-heading">
          <div><p className="eyebrow">ANNÉE SCOLAIRE</p><h2>{currentLevelLabel} · {openYear}</h2></div>
          <span>{letters.length} classe{letters.length > 1 ? 's' : ''}</span>
        </div>
        <div className="archive-gallery-grid">
          {letters.map(item => {
            const count = filtered.filter(b => {
              const parsed = parseClass(b.classes?.name ?? '')
              return parsed.levelKey === openLevel
                && (b.school_years?.label ?? 'Année non renseignée') === openYear
                && parsed.letter === item
            }).length
            return <button className="archive-letter-card" key={item} onClick={() => goToLetter(item)}>
              <span className="archive-letter-icon">{item}</span>
              <span className="archive-card-copy"><strong>Salle {item}</strong><small>{count} bulletin{count > 1 ? 's' : ''}</small></span>
              <ChevronRight size={18} className="archive-card-arrow" />
            </button>
          })}
        </div>
      </section>
    )}

    {!loading && filtered.length > 0 && openLevel && openYear && openLetter && !openPeriod && (
      <section className="archive-gallery">
        <button className="archive-gallery-back" onClick={() => setOpenLetter(null)}><ChevronLeft size={17} /> Retour aux salles</button>
        <div className="archive-gallery-heading">
          <div><p className="eyebrow">SALLE</p><h2>{currentLevelLabel} {openLetter} · {openYear}</h2></div>
          <span>{periods.length} période{periods.length > 1 ? 's' : ''}</span>
        </div>

        {periods.length === 0 ? (
          <div className="empty-state">
            <FileText size={28} />
            <h2>Aucune période dans cette salle</h2>
            <p>Cette salle existe, mais aucun bulletin n'y a encore été archivé.</p>
          </div>
        ) : (
          <div className="archive-gallery-grid">
            {periods.map(item => {
              const count = filtered.filter(b => {
                const parsed = parseClass(b.classes?.name ?? '')
                return parsed.levelKey === openLevel
                  && (b.school_years?.label ?? 'Année non renseignée') === openYear
                  && parsed.letter === openLetter
                  && (b.periods?.name ?? 'Période non renseignée') === item
              }).length
              return <button className="archive-year-card" key={item} onClick={() => goToPeriod(item)}>
                <span className="archive-year-icon"><FileText size={19} /></span>
                <span className="archive-card-copy"><strong>{item}</strong><small>{count} bulletin{count > 1 ? 's' : ''}</small></span>
                <ChevronRight size={18} className="archive-card-arrow" />
              </button>
            })}
          </div>
        )}
      </section>
    )}

    {!loading && openLevel && openYear && openLetter && openPeriod && (
      <section className="archive-gallery">
        <button className="archive-gallery-back" onClick={() => setOpenPeriod(null)}><ChevronLeft size={17} /> Retour aux périodes</button>
        <div className="archive-gallery-heading">
          <div><p className="eyebrow">BULLETINS</p><h2>{currentLevelLabel} {openLetter} · {openPeriod} · {openYear}</h2></div>
          <span>{visibleBulletins.length} document{visibleBulletins.length > 1 ? 's' : ''}</span>
        </div>

        {visibleBulletins.length === 0 ? (
          <div className="empty-state">
            <FileText size={28} />
            <h2>Aucun bulletin dans cette période</h2>
            <p>Cette période existe, mais aucun document correspondant n'est disponible.</p>
          </div>
        ) : (
          <div className="archive-gallery-list">
            {visibleBulletins.map(result => (
              <div className="archive-result-card" key={result.id}>
                <button className="archive-result-open" onClick={() => void openBulletin(result)}>
                  <span className="archive-result-icon"><FileText size={21} /></span>
                  <span className="archive-card-copy">
                    <strong>{result.original_filename}</strong>
                    <small>{new Date(result.created_at).toLocaleDateString('fr-FR')}</small>
                  </span>
                  <Eye size={18} />
                </button>
                <button type="button" className="archive-delete-btn" onClick={() => requestDelete(result)} aria-label={`Supprimer ${result.original_filename}`} title="Supprimer ce bulletin">
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    )}

    {selected && (
      <BulletinViewer
        result={selected}
        fileUrl={fileUrl}
        onClose={closeViewer}
        onDelete={() => requestDelete(selected)}
      />
    )}

    {confirmDelete && (
      <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Confirmer la suppression">
        <div className="modal-card" style={{ width: 'min(440px, 94vw)', maxWidth: 440 }}>
          <button className="modal-close" onClick={() => { if (!deleting) setConfirmDelete(null) }} aria-label="Fermer"><X size={18} /></button>
          <p className="eyebrow">SUPPRESSION</p>
          <h2>Supprimer ce bulletin ?</h2>
          <div className="delete-confirm-body">
            <strong>{confirmDelete.original_filename}</strong>
            <small>{confirmDelete.classes?.name ?? 'Classe non renseignée'} · {confirmDelete.school_years?.label ?? 'Année non renseignée'} · {confirmDelete.periods?.name ?? 'Période non renseignée'}</small>
            <small>Cette action est définitive. Le bulletin ne sera plus consultable dans vos archives.</small>
          </div>
          {deleteError && <div className="error-message">{deleteError}</div>}
          <div className="delete-actions">
            <button className="secondary" onClick={() => setConfirmDelete(null)} disabled={deleting}>Annuler</button>
            <button className="delete-danger-button" onClick={() => void confirmAndDelete()} disabled={deleting}>{deleting ? 'Suppression…' : 'Supprimer définitivement'}</button>
          </div>
        </div>
      </div>
    )}
  </>
}


function BulletinViewer({ result, fileUrl, onClose, onDelete }: { result: any; fileUrl: string; onClose: () => void; onDelete: () => void }) {
  async function downloadFile() {
    if (!fileUrl) return
    try {
      const response = await fetch(fileUrl)
      if (!response.ok) throw new Error('download')
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = result?.original_filename || 'bulletin'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500)
    } catch {
      const anchor = document.createElement('a')
      anchor.href = fileUrl
      anchor.download = result?.original_filename || 'bulletin'
      anchor.target = '_blank'
      anchor.rel = 'noreferrer'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
    }
  }

  function printFile() {
    if (!fileUrl) return
    const printWindow = window.open(fileUrl, '_blank', 'noopener,noreferrer')
    if (!printWindow) return
    const print = () => {
      try {
        printWindow.focus()
        printWindow.print()
      } catch {
        // Le navigateur peut bloquer l'impression d'un PDF intégré.
      }
    }
    printWindow.addEventListener('load', print, { once: true })
    window.setTimeout(print, 900)
  }

  const fileName = result?.original_filename || 'Bulletin'
  const extension = fileName.split('.').pop()?.toLowerCase() || ''
  const isImage = ['jpg', 'jpeg', 'png'].includes(extension)
  const isPdf = extension === 'pdf'

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Consultation du bulletin">
      <div className="modal-card" style={{ width: 'min(1100px, 96vw)', maxWidth: 1100, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <button className="modal-close" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        <p className="eyebrow">BULLETIN</p>
        <h2 style={{ marginBottom: 6 }}>{fileName}</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          {result?.classes?.name ?? 'Classe'} · {result?.school_years?.label ?? 'Année scolaire'} · {result?.periods?.name ?? 'Période'}
        </p>

        <div style={{ flex: 1, minHeight: 360, marginTop: 16, border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'auto', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {!fileUrl ? (
            <div className="empty-state compact"><FileText size={26} /><h2>Ouverture du bulletin…</h2></div>
          ) : isImage ? (
            <img src={fileUrl} alt={fileName} style={{ display: 'block', maxWidth: '100%', maxHeight: '68vh', objectFit: 'contain' }} />
          ) : isPdf ? (
            <iframe title={fileName} src={fileUrl} style={{ width: '100%', height: '68vh', border: 0 }} />
          ) : (
            <div className="empty-state compact">
              <FileText size={28} />
              <h2>Prévisualisation indisponible</h2>
              <p>Ce format peut être téléchargé directement.</p>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14, flexWrap: 'wrap' }}>
          <button className="delete-danger-button" onClick={onDelete} style={{ marginRight: 'auto' }}><Trash2 size={16} /> Supprimer</button>
          <button className="secondary" onClick={onClose}>Fermer</button>
          <button className="secondary" onClick={printFile} disabled={!fileUrl}><Printer size={16} /> Imprimer</button>
          <button className="primary" onClick={() => void downloadFile()} disabled={!fileUrl}><Download size={16} /> Télécharger</button>
        </div>
      </div>
    </div>
  )
}

function Upload() {
  const [files, setFiles] = useState<File[]>([])
  const [status, setStatus] = useState('')
  const [schoolYear, setSchoolYear] = useState('')
  const [program, setProgram] = useState('Enseignement général')
  const [schoolClass, setSchoolClass] = useState('')
  const [period, setPeriod] = useState('')
  const [legacyImport, setLegacyImport] = useState(false)
  const [touched, setTouched] = useState(false)
  const [subscriptionPlan, setSubscriptionPlan] = useState<string | null>(null)
  const [subscriptionLoading, setSubscriptionLoading] = useState(true)
  const MAX_FILE_SIZE = 100 * 1024
  const allowedExtensions = ['pdf', 'png', 'jpg', 'jpeg', 'xls', 'xlsx', 'doc', 'docx']
  const validYear = /^\d{4}-\d{4}$/.test(schoolYear)
  const canSubmit = files.length > 0 && validYear && schoolClass.trim() !== '' && period !== ''

  useEffect(() => {
    if (!supabase) {
      setSubscriptionLoading(false)
      return
    }

    supabase.from('profiles').select('establishment_id').single().then(async ({ data: profile }) => {
      if (!profile?.establishment_id) {
        setSubscriptionLoading(false)
        return
      }

      await supabase!.rpc('refresh_subscription_status', {
        target_establishment: profile.establishment_id,
      })

      const { data } = await supabase!
        .from('subscriptions')
        .select('plan, status, end_date')
        .eq('establishment_id', profile.establishment_id)
        .eq('status', 'active')
        .gt('end_date', new Date().toISOString())
        .order('end_date', { ascending: false })
        .limit(1)
        .maybeSingle()

      setSubscriptionPlan(data?.plan ?? null)
      setSubscriptionLoading(false)
    })
  }, [])

  function handleFiles(selectedFiles: File[]) {
    const validFiles = selectedFiles.filter(file => {
      const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
      return file.size <= MAX_FILE_SIZE && allowedExtensions.includes(extension)
    })

    const invalidFiles = selectedFiles.filter(file => !validFiles.includes(file))

    // On conserve les fichiers déjà sélectionnés et on ajoute les nouveaux.
    // Les doublons exacts (nom + taille + date de modification) sont ignorés.
    const merged = [...files, ...validFiles].filter((file, index, list) =>
      list.findIndex(other =>
        other.name === file.name &&
        other.size === file.size &&
        other.lastModified === file.lastModified
      ) === index
    )

    setFiles(merged)

    if (invalidFiles.length > 0) {
      setStatus(invalidFiles.some(file => file.size > MAX_FILE_SIZE) ? 'Taille maximum du fichier 100 Ko.' : 'Format de fichier non accepté. Formats acceptés : PDF, Excel, Word, JPG, PNG.')
    } else {
      setStatus('')
    }
  }

  function removeFile(indexToRemove: number) {
    setFiles(current => current.filter((_, index) => index !== indexToRemove))
    setStatus('')
  }

  async function archive() {
    setTouched(true)
    if (!canSubmit) { setStatus('Veuillez remplir tous les champs obligatoires avant de valider.'); return }
    if (!supabase) return setStatus('Supabase doit être configuré pour archiver.')
    setStatus('Vérification de l\u2019abonnement et archivage en cours...')
    const form = new FormData()
    form.append('school_year', schoolYear)
    form.append('program', program)
    form.append('class', schoolClass)
    form.append('period', period)
    form.append('legacy_import', legacyImport ? 'true' : 'false')
    files.forEach(file => form.append('files', file))
    const { error } = await supabase.functions.invoke('archive-bulletins', { body: form })
    if (error) { setStatus(error.message); return }
    window.location.href = '/?view=archives'
  }

  return <>
    <style>{`
      .upload-file-remove { width: 32px; height: 32px; flex: 0 0 32px; display: grid; place-items: center; border: 0; border-radius: 9px; background: #f3f4f6; color: #7b8494; cursor: pointer; transition: background .18s ease, color .18s ease, transform .18s ease; }
      .upload-file-remove:hover { background: #fee2e2; color: #dc2626; transform: scale(1.06); }
      .upload-file-remove:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
    `}</style>
    <PageTitle eyebrow="NOUVEL IMPORT" title="Ajouter des bulletins" description="Classez vos documents en quelques étapes." />
    <div className="steps"><span className="done">1 <small>Année</small></span><i /><span className="done">2 <small>Filière</small></span><i /><span className="current">3 <small>Classe et période</small></span><i /><span>4 <small>Fichiers</small></span></div>
    <div className="upload-layout">
      <div className="form-card">
        <h2>Informations de classement</h2>
        <label>Année scolaire
          <input
            value={schoolYear}
            onChange={e => setSchoolYear(e.target.value)}
            placeholder="2026-2027"
            pattern="\d{4}-\d{4}"
            className={touched && !validYear ? 'field-invalid' : ''}
            required
          />
          <small className={touched && !validYear ? 'field-error' : 'field-hint'}>Format attendu : AAAA-AAAA (ex. 2026-2027)</small>
        </label>
        <label>Filière
          <select value={program} onChange={e => setProgram(e.target.value)}>
            <option>Enseignement général</option>
            <option>Technique</option>
            <option>Primaire</option>
          </select>
        </label>
        <label>Classe / salle
          <input
            value={schoolClass}
            onChange={e => setSchoolClass(e.target.value)}
            placeholder="3ème A"
            className={touched && schoolClass.trim() === '' ? 'field-invalid' : ''}
            required
          />
          <small className="class-format-recommendation">Format recommandé : 3ème A, 3ème B, 4ème A… (niveau + lettre de classe).</small>
        </label>
        <label>Période
          <select
            value={period}
            onChange={e => setPeriod(e.target.value)}
            className={touched && period === '' ? 'field-invalid' : ''}
            required
          >
            <option value="">Sélectionner une période</option>
            {['1er trimestre','2e trimestre','3e trimestre','1er semestre','2e semestre','Bulletin annuel'].map(name => <option key={name}>{name}</option>)}
          </select>
        </label>
      </div>
      <div className="form-card drop-card">
        <h2>Déposer vos fichiers</h2>
        <label
          className={touched && files.length === 0 ? 'drop-zone field-invalid' : 'drop-zone'}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); handleFiles(Array.from(e.dataTransfer.files ?? [])) }}
        >
          <UploadCloud size={30} />
          <strong>Glissez vos bulletins ici</strong>
          <span>ou cliquez pour parcourir · PDF, Excel, Word, JPG, PNG · 100 Ko maximum</span>
          <input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.xls,.xlsx,.doc,.docx" onChange={e => { handleFiles(Array.from(e.target.files ?? [])); e.currentTarget.value = '' }} />
        </label>
        {subscriptionPlan === 'large' && !subscriptionLoading && (
          <div className="legacy-import-card">
            <strong>⭐ Import des anciens bulletins</strong>
            <p>Grande échelle : importez et intégrez numériquement vos anciens bulletins non édités afin de préserver votre historique.</p>
            <label className="legacy-import-option">
              <input
                type="checkbox"
                checked={legacyImport}
                onChange={e => setLegacyImport(e.target.checked)}
              />
              <span>Je veux importer des anciens bulletins</span>
            </label>
          </div>
        )}
        {subscriptionPlan !== 'large' && !subscriptionLoading && (
          <div className="field-hint" style={{ marginTop: 12 }}>
            L'import des anciens bulletins est réservé à la formule Grande échelle.
          </div>
        )}
        {files.length > 0 && <div className="file-list">{files.map((file, index) => <div className="file-row" key={`${file.name}-${file.size}-${file.lastModified}-${index}`}><FileText size={16} /><span>{file.name}<small>{(file.size / 1024).toFixed(1)} Ko</small></span><strong className="file-ok">Prêt</strong><button type="button" className="upload-file-remove" onClick={() => removeFile(index)} aria-label={`Retirer ${file.name}`} title="Retirer ce fichier"><X size={16} /></button></div>)}</div>}
        {status && <div className="success-message">{status}</div>}
        <button className="primary full" onClick={archive}>Valider le dépôt <ChevronRight size={16} /></button>
      </div>
    </div>
  </>
}

function SearchPage() {
  const [schoolClass, setSchoolClass] = useState('')
  const [year, setYear] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<any>(null)
  const [fileUrl, setFileUrl] = useState('')
  const requestId = useRef(0)
  const cache = useRef(new Map<string, any[]>())

  async function search(nextClass = schoolClass, nextYear = year) {
    const classTerm = nextClass.trim()
    const yearTerm = nextYear.trim()
    const cacheKey = `${classTerm.toLowerCase()}|${yearTerm.toLowerCase()}`

    setSearched(Boolean(classTerm || yearTerm))
    setError('')

    if (!supabase || (!classTerm && !yearTerm)) {
      setResults([])
      setLoading(false)
      return
    }

    const cached = cache.current.get(cacheKey)
    if (cached) {
      setResults(cached)
      setLoading(false)
      return
    }

    const currentRequest = ++requestId.current
    setLoading(true)

    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 8000)

    try {
      let query = supabase
        .from('bulletins')
        .select('id, file_path, original_filename, created_at, classes!inner(name), school_years!inner(label), periods!inner(name)')
        .order('created_at', { ascending: false })
        .limit(200)
        .abortSignal(controller.signal)

      if (classTerm) query = query.ilike('classes.name', `%${classTerm}%`)

      // L'année scolaire peut être saisie librement. Si l'utilisateur saisit
      // une date complète, on recherche aussi directement sur la date d'ajout.
      const dateMatch = yearTerm.match(/^(\d{4})[-\/]?(\d{2})[-\/]?(\d{2})$/)
      const frDateMatch = yearTerm.match(/^(\d{2})[\/]?(\d{2})[\/]?(\d{4})$/)
      const normalizedDate = dateMatch
        ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
        : frDateMatch
          ? `${frDateMatch[3]}-${frDateMatch[2]}-${frDateMatch[1]}`
          : ''

      if (yearTerm && !normalizedDate) {
        query = query.ilike('school_years.label', `%${yearTerm}%`)
      } else if (normalizedDate) {
        const start = new Date(`${normalizedDate}T00:00:00`).toISOString()
        const endDate = new Date(`${normalizedDate}T00:00:00`)
        endDate.setDate(endDate.getDate() + 1)
        query = query.gte('created_at', start).lt('created_at', endDate.toISOString())
      }

      const { data, error: queryError } = await query
      window.clearTimeout(timeout)

      if (currentRequest !== requestId.current) return
      if (queryError) throw queryError

      const found = data ?? []
      cache.current.set(cacheKey, found)
      setResults(found)
    } catch (err) {
      window.clearTimeout(timeout)
      if (currentRequest !== requestId.current) return
      if ((err as Error)?.name === 'AbortError') return
      setError('La recherche a rencontré un problème. Réessayez.')
      setResults([])
    } finally {
      if (currentRequest === requestId.current) setLoading(false)
    }
  }

  useEffect(() => {
    const classTerm = schoolClass.trim()
    const yearTerm = year.trim()
    if (!classTerm && !yearTerm) {
      setResults([])
      setSearched(false)
      setLoading(false)
      return
    }

    const timer = window.setTimeout(() => { void search(classTerm, yearTerm) }, 180)
    return () => window.clearTimeout(timer)
  }, [schoolClass, year])

  async function openBulletin(result: any) {
    if (!supabase) return
    const { data, error } = await supabase.storage.from('bulletins').createSignedUrl(result.file_path, 600)
    if (error || !data?.signedUrl) {
      setError('Impossible d’ouvrir ce bulletin pour le moment.')
      return
    }
    setSelected(result)
    setFileUrl(data.signedUrl)
  }

  return <>
    <PageTitle eyebrow="RECHERCHE RAPIDE" title="Rechercher un bulletin" description="Retrouvez vos bulletins instantanément par classe ou année scolaire." />
    <div className="search-box">
      <Search size={20} />
      <input value={schoolClass} onChange={e => setSchoolClass(e.target.value)} placeholder="Classe · 3ème A" autoComplete="off" />
      <input value={year} onChange={e => setYear(e.target.value)} placeholder="Année ou date · 2026-2027" autoComplete="off" />
      <button className="primary" type="button" onClick={() => void search()} disabled={loading}>{loading ? 'Recherche…' : 'Rechercher'}</button>
    </div>
    {loading && <div className="search-live-status"><span className="search-spinner" /> Recherche en cours…</div>}
    {error && <div className="error-message">{error}</div>}
    {!searched
      ? <div className="empty-state compact"><Search size={25} /><h2>Recherchez un bulletin</h2><p>Commencez par saisir une classe ou une année scolaire. Les résultats apparaissent automatiquement.</p></div>
      : results.length === 0 && !loading
        ? <div className="empty-state compact"><Search size={25} /><h2>Aucun résultat</h2><p>Aucun bulletin ne correspond aux critères saisis.</p></div>
        : <div className="results-list">{results.map(result => <button className="result-row archive-result-button" key={result.id} onClick={() => openBulletin(result)}>
            <FileText size={18} />
            <span><strong>{result.original_filename}</strong><small>{result.classes.name} · {result.periods.name} · {result.school_years.label}</small></span>
            <small>{new Date(result.created_at).toLocaleDateString('fr-FR')}</small>
          </button>)}</div>}
    {selected && <BulletinViewer result={selected} fileUrl={fileUrl} onClose={() => { setSelected(null); setFileUrl('') }} onDelete={() => {}} />}
    <style>{`
      .search-live-status { display:flex; align-items:center; gap:9px; margin:10px 0 14px; color:#64748b; font-size:13px; }
      .search-spinner { width:14px; height:14px; border:2px solid #dbe5f1; border-top-color:#2563eb; border-radius:50%; animation:searchSpin .65s linear infinite; }
      @keyframes searchSpin { to { transform:rotate(360deg); } }
      .search-box button:disabled { opacity:.72; cursor:wait; }
    `}</style>
  </>
}
function Subscription() {
  const subscription = useSubscription()
  const [status, setStatus] = useState('')
  const [selectedPlan, setSelectedPlan] = useState<'small' | 'large' | null>(null)
  const plans = {
    small: {
      amount: 17000,
      label: 'Petite échelle',
      price: '17 000 FCFA',
      features: [
        'Jusqu’à 5 000 bulletins',
        '50 bulletins supplémentaires offerts après atteinte du plafond',
        'Disponibilité des bulletins en temps réel',
        'Conservation et consultation',
        'Recherche et téléchargement',
        'Protection et sécurité des données',
        'Archivage sur 12 mois',
      ],
    },
    large: {
      amount: 44000,
      label: 'Grande échelle',
      price: '44 000 FCFA',
      features: [
        'Bulletins illimités',
        '⭐ Import et numérisation des anciens bulletins non édités',
        '⭐ Intégration des anciennes archives dans votre espace numérique',
        'Import de gros volumes',
        'Conservation des archives historiques',
        'Recherche avancée',
        'Consultation et téléchargement',
        'Mises à jour en temps réel',
        'Protection et sécurité des données',
        'Archivage sur 12 mois',
      ],
    },
  } as const

  async function pay(plan: keyof typeof plans) {
    const startedAt = new Date().toISOString()
    setStatus('')
    if (!supabase) return setStatus('Supabase doit être configuré pour démarrer le paiement.')
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('profiles').select('establishment_id').single()
    if (!profile?.establishment_id) return setStatus('Établissement introuvable pour ce compte.')

    const selected = plans[plan]
    const FedaPay = (window as any).FedaPay
    if (!FedaPay) return setStatus('Le script FedaPay n’est pas chargé. Vérifiez votre connexion internet.')

    const widget = FedaPay.init({
      public_key: import.meta.env.VITE_FEDAPAY_PUBLIC_KEY,
      environment: import.meta.env.VITE_FEDAPAY_ENVIRONMENT ?? 'live',
      transaction: {
        amount: selected.amount,
        description: `MOVA Sauvegarde - ${plan}`,
        custom_metadata: {
          establishment_id: profile.establishment_id,
          plan,
        },
      },
      customer: { email: user?.email ?? '' },
      onComplete: async (response: any) => {
        const FedaPayGlobal = (window as any).FedaPay
        if (response.reason === FedaPayGlobal.DIALOG_DISMISSED) {
          setStatus('Paiement annulé.')
          return
        }
        setStatus('Paiement confirmé par FedaPay. Vérification de votre abonnement...')
        for (let attempt = 0; attempt < 15; attempt += 1) {
          await new Promise(resolve => window.setTimeout(resolve, 2000))
          const { data: current } = await supabase!.from('subscriptions').select('id, plan, start_date, end_date, status, created_at').eq('status', 'active').gte('created_at', startedAt).order('created_at', { ascending: false }).limit(1).maybeSingle()
          if (current) {
            sessionStorage.setItem('mova_payment_confirmation', `Félicitations ! Votre abonnement ${current.plan} est activé. Profitez de toutes les fonctionnalités.`)
            window.location.href = '/'
            return
          }
        }
        setStatus('Paiement reçu. La confirmation serveur est encore en cours, veuillez patienter quelques instants.')
      },
    })
    widget.open()
  }

  const planLabels: Record<string, string> = { small: 'Petite échelle', large: 'Grande échelle' }
  const active = subscription?.status === 'active' && subscription.end_date > new Date().toISOString()
  const planPrice: Record<string, string> = { small: '17 000 FCFA / an', large: '44 000 FCFA / an' }

  return <>
    <ModernPricingStyles />
    <PageTitle eyebrow="GESTION DU COMPTE" title="Mon abonnement" description="Choisissez la formule qui correspond au volume d’archives de votre établissement." />

    <div className="subscription-card">
      <div>
        {subscription ? <span className={active ? 'pill active-pill' : 'pill'}>{active ? 'Actif' : 'Expiré'}</span> : <span className="pill">Aucun abonnement</span>}
        <h2>{subscription ? `Formule ${planLabels[subscription.plan] ?? subscription.plan}` : 'Aucun abonnement actif'}</h2>
        {subscription && <p className="muted">Du {new Date(subscription.start_date).toLocaleDateString('fr-FR')} au {new Date(subscription.end_date).toLocaleDateString('fr-FR')}</p>}
      </div>
      {subscription && <strong className="price">{planPrice[subscription.plan] ?? ''}</strong>}
    </div>

    <section className="modern-pricing">
      <div className="modern-pricing-heading">
        <p className="eyebrow">FORMULES ANNUELLES</p>
        <h2>Simple à choisir. Puissant à utiliser.</h2>
        <p>Chaque formule est pensée pour conserver vos bulletins en toute sécurité pendant 12 mois.</p>
      </div>

      <div className="modern-paid-plan-grid">
        {(Object.entries(plans) as Array<[keyof typeof plans, typeof plans.small]>).map(([plan, item]) => (
          <article className={`modern-plan ${plan === 'large' ? 'modern-plan-featured' : ''}`} key={plan}>
            {plan === 'large' && <div className="modern-plan-ribbon">⭐ RECOMMANDÉ · ANCIENS BULLETINS</div>}
            <div className="modern-plan-top">
              <div>
                <span className="modern-plan-kicker">{plan === 'large' ? 'POUR LES GRANDS VOLUMES' : 'POUR COMMENCER'}</span>
                <h3>{item.label}</h3>
              </div>
              <span className="modern-plan-icon">{plan === 'large' ? '✦' : '✓'}</span>
            </div>
            <div className="modern-plan-price"><strong>{item.price}</strong><span>/ an</span></div>
            <div className="modern-feature-list">
              {item.features.map(feature => <div className="modern-feature" key={feature}><span className="feature-check">✓</span><span><b>{feature}</b></span></div>)}
            </div>
            <button className={plan === 'large' ? 'primary modern-plan-button' : 'secondary modern-plan-button'} onClick={() => setSelectedPlan(plan)}>
              Choisir cette formule <ChevronRight size={17} />
            </button>
          </article>
        ))}
      </div>

      <article className="modern-plan modern-plan-free modern-free-bottom">
        <div className="modern-free-bottom-content">
          <div className="modern-plan-top">
            <div>
              <span className="modern-plan-kicker">POUR DÉCOUVRIR</span>
              <h3>Plan Free</h3>
            </div>
            <span className="modern-plan-icon">○</span>
          </div>
          <div className="modern-plan-price"><strong>0 FCFA</strong><span>/ gratuit</span></div>
          <p className="modern-free-highlight"><strong>50 bulletins gratuits</strong> à transférer et conserver.</p>
          <div className="modern-free-features">
            {['Disponibilité des bulletins en temps réel', 'Conservation et consultation', 'Recherche et téléchargement', 'Protection et sécurité des données'].map(feature => <div className="modern-feature" key={feature}><span className="feature-check">✓</span><span><b>{feature}</b></span></div>)}
          </div>
        </div>
        <button className="secondary modern-free-button" disabled>
          Plan gratuit <span>Inclus</span>
        </button>
      </article>
    </section>

    {status && <div className="success-message">{status}</div>}

    {selectedPlan && (
      <div className="modern-modal-backdrop" role="dialog" aria-modal="true">
        <div className="modern-payment-modal">
          <button className="modern-modal-close" onClick={() => setSelectedPlan(null)} aria-label="Fermer"><X size={20} /></button>
          <div className="modern-modal-icon">{selectedPlan === 'large' ? '⭐' : '✓'}</div>
          <p className="eyebrow">CONFIRMATION</p>
          <h2>{plans[selectedPlan].label}</h2>
          <div className="modern-modal-price">{plans[selectedPlan].price}<span> / 12 mois</span></div>
          <p className="modern-modal-text">Vous allez être redirigé vers le paiement sécurisé FedaPay pour activer cette formule.</p>
          <div className="modern-modal-summary">
            {plans[selectedPlan].features.slice(0, selectedPlan === 'large' ? 4 : 3).map(feature => <div key={feature}><span>✓</span>{feature}</div>)}
          </div>
          <div className="modern-modal-actions">
            <button className="secondary" onClick={() => setSelectedPlan(null)}>Retour</button>
            <button className="primary" onClick={() => { const plan = selectedPlan; setSelectedPlan(null); void pay(plan) }}>Continuer vers FedaPay <ChevronRight size={17} /></button>
          </div>
        </div>
      </div>
    )}
  </>
}


function ModernPricingStyles() {
  return <style>{`
    .modern-pricing { width: min(1120px, 100%); margin: 34px auto 10px; }
    .modern-pricing-heading { text-align: center; max-width: 720px; margin: 0 auto 28px; }
    .modern-pricing-heading h2 { margin: 6px 0 10px; font-size: clamp(26px, 3vw, 36px); letter-spacing: -0.03em; }
    .modern-pricing-heading p:last-child { margin: 0; color: #687386; }
    .modern-paid-plan-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; align-items: stretch; }
    .modern-free-bottom { margin-top: 22px; display: flex; align-items: center; justify-content: space-between; gap: 28px; padding: 22px 26px; }
    .modern-free-bottom-content { flex: 1; min-width: 0; }
    .modern-free-bottom .modern-plan-top { align-items: center; }
    .modern-free-bottom .modern-plan-price { margin: 10px 0 8px; }
    .modern-free-bottom .modern-plan-price strong { font-size: 28px; }
    .modern-free-highlight { margin: 0 0 12px; color: #6f7785; font-size: 13px; }
    .modern-free-features { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 20px; }
    .modern-free-features .modern-feature { font-size: 12px; }
    .modern-free-button { width: 180px; flex: 0 0 180px; margin: 0; }
    .modern-free-button:disabled { opacity: .72; cursor: not-allowed; }
    .modern-plan { position: relative; background: #fff; border: 1px solid #e7eaf0; border-radius: 24px; padding: 30px; box-shadow: 0 18px 50px rgba(24, 39, 75, .08); transition: transform .25s ease, box-shadow .25s ease, border-color .25s ease; overflow: hidden; }
    .modern-plan:hover { transform: translateY(-5px); box-shadow: 0 24px 65px rgba(24, 39, 75, .13); }
    .modern-plan-featured { border: 2px solid #1d4ed8; box-shadow: 0 24px 70px rgba(29, 78, 216, .16); }
    .modern-plan-free { background: #f4f5f7; border-color: #e0e3e8; color: #7a8190; box-shadow: 0 14px 35px rgba(24, 39, 75, .05); }
    .modern-plan-free:hover { transform: none; box-shadow: 0 14px 35px rgba(24, 39, 75, .05); }
    .modern-plan-free .modern-plan-icon { background: #e4e7eb; color: #8b93a0; }
    .modern-plan-free .modern-plan-price strong, .modern-plan-free h3 { color: #747c89; }
    .modern-plan-free .modern-feature { color: #7a8190; }
    .modern-plan-free .feature-check { background: #e1e4e8; color: #858d99; }
    .modern-plan-button:disabled { opacity: .72; cursor: not-allowed; transform: none !important; }
    .modern-plan-button span { font-size: 12px; margin-left: 5px; opacity: .8; }
    .file-remove { width: 32px; height: 32px; flex: 0 0 32px; display: grid; place-items: center; border: 0; border-radius: 9px; background: #f3f4f6; color: #7b8494; cursor: pointer; transition: all .18s ease; }
    .file-remove:hover { background: #fee2e2; color: #dc2626; transform: scale(1.06); }
    .file-remove:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
    .modern-plan-ribbon { margin: -30px -30px 25px; padding: 12px 18px; text-align: center; font-size: 11px; font-weight: 800; letter-spacing: .07em; color: #fff; background: linear-gradient(90deg, #1d4ed8, #2563eb, #7c3aed); }
    .modern-plan-top { display: flex; justify-content: space-between; gap: 15px; align-items: flex-start; }
    .modern-plan-kicker { font-size: 10px; font-weight: 800; letter-spacing: .12em; color: #7b8494; }
    .modern-plan h3 { margin: 5px 0 0; font-size: 25px; }
    .modern-plan-icon { width: 44px; height: 44px; display: grid; place-items: center; border-radius: 14px; background: #f0f5ff; color: #1d4ed8; font-weight: 900; font-size: 21px; }
    .modern-plan-price { display: flex; align-items: baseline; gap: 6px; margin: 24px 0 22px; }
    .modern-plan-price strong { font-size: 34px; letter-spacing: -0.04em; }
    .modern-plan-price span { color: #788294; }
    .modern-feature-list { display: grid; gap: 13px; min-height: 250px; }
    .modern-feature { display: grid; grid-template-columns: 23px 1fr; gap: 9px; align-items: start; color: #3f4858; line-height: 1.4; font-size: 14px; }
    .modern-feature b { font-weight: 600; }
    .feature-check { width: 22px; height: 22px; display: grid; place-items: center; border-radius: 50%; background: #eaf7ef; color: #138a4b; font-size: 12px; font-weight: 900; }
    .modern-plan-featured .feature-check { background: #eaf0ff; color: #1d4ed8; }
    .modern-plan-button { width: 100%; justify-content: center; margin-top: 25px; min-height: 48px; }
    .modern-modal-backdrop { position: fixed; inset: 0; z-index: 9999; display: grid; place-items: center; padding: 20px; background: rgba(12, 20, 35, .58); backdrop-filter: blur(9px); animation: modernFadeIn .18s ease-out; }
    .modern-payment-modal { width: min(500px, 100%); position: relative; background: #fff; border-radius: 26px; padding: 34px; box-shadow: 0 30px 100px rgba(0,0,0,.25); animation: modernPop .28s cubic-bezier(.2,.8,.2,1); }
    .modern-modal-close { position: absolute; top: 16px; right: 16px; width: 38px; height: 38px; border: 0; border-radius: 50%; background: #f2f4f8; color: #586274; display: grid; place-items: center; cursor: pointer; }
    .modern-modal-icon { width: 58px; height: 58px; display: grid; place-items: center; border-radius: 18px; background: #eef4ff; font-size: 25px; margin-bottom: 18px; }
    .modern-payment-modal h2 { margin: 6px 0 7px; font-size: 29px; }
    .modern-modal-price { font-size: 24px; font-weight: 800; margin-bottom: 12px; }
    .modern-modal-price span { font-size: 14px; color: #758094; font-weight: 500; }
    .modern-modal-text { color: #697386; line-height: 1.55; margin: 0 0 20px; }
    .modern-modal-summary { display: grid; gap: 10px; padding: 16px; border-radius: 16px; background: #f7f9fc; margin-bottom: 24px; }
    .modern-modal-summary div { display: flex; gap: 9px; font-size: 13px; color: #414a5a; }
    .modern-modal-summary span { color: #138a4b; font-weight: 900; }
    .modern-modal-actions { display: flex; gap: 10px; justify-content: flex-end; }
    .modern-modal-actions button { min-height: 46px; }
    @keyframes modernFadeIn { from { opacity: 0 } to { opacity: 1 } }
    @keyframes modernPop { from { opacity: 0; transform: translateY(16px) scale(.96) } to { opacity: 1; transform: translateY(0) scale(1) } }
    @media (max-width: 980px) { .modern-paid-plan-grid { grid-template-columns: 1fr 1fr; } .modern-free-features { grid-template-columns: 1fr; } }
    @media (max-width: 760px) { .modern-paid-plan-grid { grid-template-columns: 1fr; } .modern-plan { padding: 24px; } .modern-plan-ribbon { margin: -24px -24px 22px; } .modern-feature-list { min-height: 0; } .modern-free-bottom { display: block; padding: 22px; } .modern-free-button { width: 100%; margin-top: 16px; } .modern-payment-modal { padding: 28px 22px; } .modern-modal-actions { flex-direction: column-reverse; } .modern-modal-actions button { width: 100%; justify-content: center; } }
  `}</style>
}

function Notifications() {
  const [items, setItems] = useState<any[]>([])
  const [now] = useState(() => Date.now())
  useEffect(() => {
    if (!supabase) return
    supabase.from('profiles').select('establishment_id').single().then(async ({ data: profile }) => {
      if (!profile?.establishment_id) return
      const { data } = await supabase!.from('notifications').select('id, type, title, message, created_at, read').eq('establishment_id', profile.establishment_id).order('created_at', { ascending: false }).limit(20)
      setItems(data ?? [])
    })
  }, [])
  function timeAgo(dateString: string) {
    const diffMs = now - new Date(dateString).getTime()
    const minutes = Math.floor(diffMs / 60000)
    if (minutes < 1) return 'À l\u2019instant'
    if (minutes < 60) return `Il y a ${minutes} min`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `Il y a ${hours} h`
    const days = Math.floor(hours / 24)
    return `Il y a ${days} j` 
  }
  return <>
    <PageTitle eyebrow="CENTRE D'ALERTES" title="Notifications" description="Les événements importants de votre établissement." />
    {items.length === 0
      ? <div className="empty-state compact"><Bell size={25} /><h2>Aucune notification</h2><p>Vous serez informé ici des événements importants (paiement, abonnement, etc.).</p></div>
      : <div className="notification-list">
          {items.map(item => (
            <div className={item.read ? 'notification' : 'notification unread'} key={item.id}>
              <span><Bell size={17} /></span>
              <div>
                <strong>{item.title}</strong>
                <p>{item.message}</p>
                <small>{timeAgo(item.created_at)}</small>
              </div>
            </div>
          ))}
        </div>
    }
  </>
}

function Establishment({ email }: { email: string }) { const [establishment, setEstablishment] = useState<any>(null); const [editing, setEditing] = useState(false); const [form, setForm] = useState({ officialName: '', professionalEmail: email }); const [status, setStatus] = useState(''); useEffect(() => { if (!supabase) return; supabase.from('profiles').select('establishment_id').single().then(async ({ data: profile }) => { if (!profile?.establishment_id) return; const { data } = await supabase!.from('establishments').select('official_name, city, professional_email, requester_name, country, address, status').eq('id', profile.establishment_id).single(); setEstablishment(data); if (data) setForm({ officialName: data.official_name ?? '', professionalEmail: data.professional_email ?? email }) }) }, [email]); async function save() { if (!supabase) return; setStatus('Enregistrement...'); const { error } = await supabase.functions.invoke('update-establishment', { body: form }); if (error) return setStatus(error.message); setEstablishment((current: any) => ({ ...current, official_name: form.officialName, professional_email: form.professionalEmail })); setEditing(false); setStatus('Informations mises à jour.') } return <><PageTitle eyebrow="VOTRE ORGANISATION" title="Mon établissement" description="Les informations rattachées à votre espace." /><div className="details-card"><div className="details-heading"><span className="building-icon"><Building2 size={23} /></span><div><h2>{establishment?.official_name ?? 'Établissement non renseigné'}</h2><span className="pill active-pill">{establishment?.status ?? 'Non renseigné'}</span></div></div><div className="details-grid"><div><small>Nom officiel</small><strong>{establishment?.official_name ?? 'Non renseigné'}</strong></div><div><small>Ville</small><strong>{establishment?.city ?? 'Non renseignée'}</strong></div><div><small>Email professionnel</small><strong>{establishment?.professional_email ?? email}</strong></div><div><small>Responsable</small><strong>{establishment?.requester_name ?? 'Non renseigné'}</strong></div></div><button className="secondary" onClick={() => { setEditing(true); setStatus('') }}>Demander une modification</button></div>{editing && <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="modal-card"><button className="modal-close" onClick={() => setEditing(false)}><X size={18} /></button><p className="eyebrow">MODIFICATION</p><h2>Modifier les informations</h2><label>Nom de l'établissement<input value={form.officialName} onChange={event => setForm({ ...form, officialName: event.target.value })} /></label><label>Email professionnel<input type="email" value={form.professionalEmail} onChange={event => setForm({ ...form, professionalEmail: event.target.value })} /></label>{status && <div className="success-message">{status}</div>}<button className="primary full" onClick={save}>Enregistrer</button></div></div>}</> }
export default App