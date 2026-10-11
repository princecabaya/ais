import { useEffect, useState, type FormEvent } from 'react';
import { BookOpen, CalendarDays, CheckCircle2, ClipboardList, LogOut, Mail, ShieldCheck, UserRound, Users } from 'lucide-react';
import { configured, domainOk, supabase } from './supabase';
import { PSU_LOGO } from './psuLogo';
import { CurriculumManagement } from './CurriculumManagement';
import { CourseSelection } from './CourseSelection';
import { GeneralInformation } from './GeneralInformation';
import { AdminScheduleReports } from './AdminScheduleReports';
import { FacultyAvailability } from './FacultyAvailability';
import { SchedulePreview } from './SchedulePreview';
import { RoomScheduling } from './RoomScheduling';
import { AdministratorApproval } from './AdministratorApproval';
import { OfficialWorkload } from './OfficialWorkload';
import { AcademicTermSettings } from './AcademicTermSettings';
import { FacultyHelpChat } from './FacultyHelpChat';
import { MyAccount } from './MyAccount';
import type { Session } from '@supabase/supabase-js';

type Profile = {
  id: string;
  email: string;
  username: string;
  first_name: string;
  last_name: string;
  middle_initial: string | null;
  department: 'BEEd' | 'BSE' | 'Administration';
  employment_type: 'regular' | 'tempo' | 'cos' | 'part_time';
  role: 'faculty' | 'admin';
  status: 'active' | 'pending' | 'disabled';
};

type Invite = {
  email: string;
  department: string;
  created_at: string;
  used_at: string | null;
};

const normal = (value: string) => value.toUpperCase().trim().replace(/\s+/g, ' ');

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [workspaceTab, setWorkspaceTab] = useState('courses');
  function showWorkspaceTab(id: string) {
    setWorkspaceTab(id);
    window.requestAnimationFrame(() => document.querySelector('.workspace-nav')?.scrollIntoView({behavior:'smooth',block:'start'}));
  }
  const [profile, setProfile] = useState<Profile | null>(null);
  const [step, setStep] = useState<'email' | 'link-sent' | 'password' | 'profile'>('email');
  const [authMode, setAuthMode] = useState<'login' | 'activate'>('login');
  const [email, setEmail] = useState('');
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [mi, setMi] = useState('');
  const [department, setDepartment] = useState<'BEEd' | 'BSE' | 'Administration'>('BEEd');
  const [employment, setEmployment] = useState<'regular' | 'tempo' | 'cos' | 'part_time'>('regular');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteDept, setInviteDept] = useState<'BEEd' | 'BSE' | 'Administration'>('BEEd');
  const [inviteRole, setInviteRole] = useState<'faculty' | 'admin'>('faculty');
  const [adminEmails, setAdminEmails] = useState<string[]>([]);

  async function loadProfile(userId: string) {
    const { data, error } = await supabase!.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (error) setMessage(error.message);
    setProfile((data as Profile | null) || null);
  }

  async function loadInvites() {
    const { data, error } = await supabase!
      .from('faculty_invitations')
      .select('email,department,created_at,used_at')
      .order('created_at', { ascending: false });
    if (error) setMessage(error.message);
    else setInvites((data || []) as Invite[]);
    const { data: authorizations, error: authError } = await supabase!.from('administrator_authorizations').select('email');
    if (authError) setMessage(authError.message);
    else setAdminEmails((authorizations || []).map((row) => row.email as string));
  }

  useEffect(() => {
    if (!supabase) return;
    let live = true;
    supabase.auth.getSession().then(({ data }) => {
      if (live) setSession(data.session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => {
      live = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (session?.user.id) {
      void loadProfile(session.user.id);
      setStep((current) => current === 'profile' ? 'profile' : 'password');
    } else setProfile(null);
  }, [session?.user.id]);

  useEffect(() => {
    if (profile?.role === 'admin') void loadInvites();
  }, [profile?.role]);

  async function signInWithPassword(e: FormEvent) {
    e.preventDefault();
    setMessage('');
    const identifier = loginIdentifier.trim();
    if (!identifier) {
      setMessage('Enter your registered username or PSU email.');
      return;
    }
    if (identifier.includes('@') && !domainOk(identifier)) {
      setMessage('Use your registered @psu.palawan.edu.ph email or your faculty username.');
      return;
    }
    if (!identifier.includes('@') && !/^[a-zA-Z0-9._-]{3,30}$/.test(identifier)) {
      setMessage('Enter a valid registered username (3–30 letters, numbers, dots, underscores, or hyphens).');
      return;
    }
    setBusy(true);
    try {
      if (identifier.includes('@')) {
        const { error } = await supabase!.auth.signInWithPassword({
          email: identifier.toLowerCase(),
          password,
        });
        if (error) throw error;
      } else {
        // Username is privately resolved inside the Supabase Edge Function.
        // The function validates the password through Supabase Auth; it never
        // exposes the associated email for incorrect credentials.
        const { data, error } = await supabase!.functions.invoke('username-login', {
          body: { username: identifier.toLowerCase(), password },
        });
        if (error || !data?.access_token || !data?.refresh_token) {
          throw new Error('Invalid username or password.');
        }
        const { error: sessionError } = await supabase!.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        });
        if (sessionError) throw sessionError;
      }
      setPassword('');
      setMessage('');
    } catch (err) {
      const detail = (err as Error).message;
      setMessage(/invalid|credential|login/i.test(detail)
        ? 'Incorrect email/username or password. Check your details or activate your account if you have not registered.'
        : 'Unable to log in right now. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function sendConfirmationLink(e: FormEvent) {
    e.preventDefault();
    setMessage('');
    if (!domainOk(email)) {
      setMessage('A valid @psu.palawan.edu.ph address is required.');
      return;
    }
    setBusy(true);
    try {
      const { data: allowed, error: allowErr } = await supabase!.rpc('is_invited_email', { candidate_email: email.trim().toLowerCase() });
      if (allowErr) throw allowErr;
      if (!allowed) throw new Error('This email is not on the administrator invitation list.');
      const { error } = await supabase!.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/` } });
      if (error) throw error;
      setStep('link-sent');
      setMessage('A secure confirmation or sign-in link has been requested. Open the latest email and follow its link to return here.');
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function setNewPassword(e: FormEvent) {
    e.preventDefault();
    if (password.length < 12) {
      setMessage('Use a password of at least 12 characters.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase!.auth.updateUser({ password });
      if (error) throw error;
      setPassword('');
      setStep('profile');
      setMessage('Password saved. Complete your faculty profile.');
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      if (!session) throw new Error('Log in first.');
      if (!/^[A-Za-z0-9._-]{3,30}$/.test(username)) throw new Error('Username must be 3–30 letters, numbers, dots, underscores or hyphens.');
      if (!first.trim() || !last.trim()) throw new Error('First name and last name are required.');
      if (mi.trim() && !/^[A-Za-z]\.?$/.test(mi.trim())) throw new Error('Middle initial must contain one letter.');
      const { error } = await supabase!.from('profiles').insert({
        id: session.user.id,
        username: username.toLowerCase(),
        first_name: normal(first),
        last_name: normal(last),
        middle_initial: mi.trim() ? normal(mi).replace('.', '') + '.' : null,
        department,
        employment_type: employment,
      });
      if (error) throw error;
      await loadProfile(session.user.id);
      setMessage('Profile submitted. Welcome to the faculty portal.');
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addInvite(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      if (!domainOk(inviteEmail)) throw new Error('Only PSU corporate email addresses are allowed.');
      const { error } = await supabase!.from('faculty_invitations').insert({ email: inviteEmail.trim().toLowerCase(), department: inviteDept, invited_by: session!.user.id });
      if (error) throw error;
      if (inviteRole === 'admin') {
        const { error: grantError } = await supabase!.rpc('grant_administrator', { candidate_email: inviteEmail.trim().toLowerCase() });
        if (grantError) throw grantError;
      }
      setInviteEmail('');
      await loadInvites();
      setMessage(inviteRole === 'admin' ? 'Administrator email authorized. Share the portal address for PSU email verification.' : 'Faculty email authorized. Share the portal address with the faculty member.');
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await supabase?.auth.signOut();
    setProfile(null);
    setStep('email');
    setAuthMode('login');
    setPassword('');
    setMessage('Signed out.');
  }

  return (
    <div className={session && profile ? "app app--signed-in" : "app"}>
      <header>
        <div className="brand">
          <div className="logo-wrap">
            <img src={PSU_LOGO} alt="Palawan State University logo" className="brand-logo" />
          </div>
          <div>
            <strong>PALAWAN STATE UNIVERSITY</strong>
            <small>Balabac Campus · Faculty Scheduling</small>
          </div>
        </div>
        <div className="topright">
          {session && (
            <button className="ghost" onClick={logout}>
              <LogOut size={16} /> Sign out
            </button>
          )}
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-badge">
            <span className="kicker">INDEPENDENT ACADEMIC PORTAL</span>
          </div>
          <h1>Faculty Course Selection<br /><em>& Scheduling System</em></h1>
          <p>Secure faculty registration, curriculum-aligned course preferences, conflict-aware timetables, and administrator-approved workload assignments.</p>
        </section>

        {!configured ? (
          <div className="panel warning">
            <h2>Supabase connection needed</h2>
            <p>Create a separate Supabase project and configure <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in Vercel. The application does not connect to your examination database.</p>
          </div>
        ) : !session ? (
          <div className="panel auth auth-entry">
            <div className="iconhead"><Mail size={19}/><span>Faculty access</span></div>
            <div className="auth-mode-switch" role="group" aria-label="Choose faculty authentication">
              <button type="button" className={authMode === 'login' ? 'auth-mode-selected' : ''}
                onClick={() => {setAuthMode('login');setStep('email');setMessage('');setPassword('');}}>
                Log In
              </button>
              <button type="button" className={authMode === 'activate' ? 'auth-mode-selected' : ''}
                onClick={() => {setAuthMode('activate');setStep('email');setMessage('');setPassword('');}}>
                Activate Account
              </button>
            </div>
            {authMode === 'login' ? (
              <form onSubmit={signInWithPassword}>
                <div className="auth-introduction"><h2>Welcome back</h2><p>Sign in to manage your courses and teaching schedule.</p></div>
                <label>PSU email or username
                  <input type="text" autoComplete="username" required value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    placeholder="Username or PSU email" />
                </label>
                <label>Password
                  <input type="password" autoComplete="current-password" required
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password" />
                </label>
                <button type="submit" className="primary" disabled={busy}>
                  {busy ? 'Logging in…' : 'Log In'}
                </button>
              </form>
            ) : step === 'email' ? (
              <form onSubmit={sendConfirmationLink}>
                <div className="auth-introduction"><h2>Activate your account</h2><p>Use the PSU email address authorized by your campus administrator.</p></div>
                <label>PSU corporate email
                  <input type="email" autoComplete="email" required value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="faculty@psu.palawan.edu.ph" />
                </label>
                <button type="submit" disabled={busy} className="primary">
                  {busy ? 'Sending…' : 'Send confirmation link'}
                </button>
              </form>
            ) : (
              <div className="link-confirmation">
                <h2>Check your PSU email inbox</h2>
                <p>Open the newest message for <strong>{email}</strong> and click its confirmation link. You will return to this website to create your password and complete your profile.</p>
                <button type="button" className="link" onClick={() => setStep('email')}>Use another email or resend link</button>
              </div>
            )}
          </div>
        ) : !profile ? (
          <div className="panel auth">
            <div className="iconhead"><UserRound /><span>First-time account setup</span></div>
            {step !== 'profile' ? (
              <form onSubmit={setNewPassword}>
                <h2>Create your password</h2>
                <label>Password (12+ characters)<input type="password" autoComplete="new-password" required minLength={12} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
                <button className="primary" disabled={busy}>Save password</button>
              </form>
            ) : (
              <form onSubmit={saveProfile}>
                <h2>Complete faculty profile</h2>
                <p>Your PSU identity is {session.user.email}. All names will be stored in uppercase.</p>
                <label>Username<input required value={username} onChange={(e) => setUsername(e.target.value)} placeholder="faculty.username" /></label>
                <div className="two">
                  <label>Last name<input required value={last} onChange={(e) => setLast(e.target.value)} placeholder="DELA CRUZ" /></label>
                  <label>First name<input required value={first} onChange={(e) => setFirst(e.target.value)} placeholder="JUAN" /></label>
                </div>
                <label>Middle initial<input maxLength={2} value={mi} onChange={(e) => setMi(e.target.value)} placeholder="A." /></label>
                <div className="two">
                  <label>Faculty affiliation<select value={department} onChange={(e) => setDepartment(e.target.value as 'BEEd' | 'BSE' | 'Administration')}><option value="BEEd">BEEd</option><option value="BSE">BSE</option><option value="Administration">Campus Administration</option></select></label>
                  <label>Employment type<select value={employment} onChange={(e) => setEmployment(e.target.value as 'regular' | 'tempo' | 'cos' | 'part_time')}><option value="regular">Regular — Plantilla (Full-time)</option><option value="tempo">Tempo — Conditional Plantilla (Full-time)</option><option value="cos">COS — Contract of Service (Full-time)</option><option value="part_time">Part-time</option></select></label>
                </div>
                <button disabled={busy} className="primary">Save profile</button>
              </form>
            )}
          </div>
        ) : (
          <section className="dashboard">
            <div className="welcome">
              <div>
                <span className="kicker">FACULTY DASHBOARD</span>
                <h2>Welcome, {profile.first_name} {profile.last_name}</h2>
                <p>{profile.department} Faculty · {({regular:'Regular · Plantilla (Full-time)',tempo:'Tempo · Conditional Plantilla (Full-time)',cos:'COS · Contract of Service (Full-time)',part_time:'Part-time'} as const)[profile.employment_type]} · {profile.role === 'admin' ? 'Administrator' : 'Faculty'}</p>
              </div>
              <span className="status"><CheckCircle2 size={16} /> {profile.status}</span>
            </div>
            <nav className="workspace-nav" aria-label="Faculty scheduling workspace">
              <div className="workspace-nav-title">
                <strong>{profile.role === 'admin' ? 'Scheduling and Administration' : 'My Teaching Workspace'}</strong>
                <small>Choose a step. You do not need to scroll through every module.</small>
              </div>
              <div className="workspace-nav-tabs">
                {[
                  {id:'account',label:'My Account',icon:UserRound},
                  {id:'information',label:'General Information',icon:BookOpen},
                  {id:'courses',label:'1. Select Courses',icon:BookOpen},
                  {id:'preview',label:'2. Schedule Preview',icon:CalendarDays},
                  {id:'availability',label:'3. Availability',icon:CalendarDays},
                  {id:'scheduling',label:'4. Schedule & Rooms',icon:CalendarDays},
                  {id:'workload',label:'5. Faculty Workload',icon:ClipboardList},
                  ...(profile.role==='admin' ? [
                    {id:'reports',label:'Admin: Schedule Reports',icon:CalendarDays},
                    {id:'approval',label:'Admin: Approvals',icon:ShieldCheck},
                    {id:'semester',label:'Admin: Semester',icon:CalendarDays},
                    {id:'curriculum',label:'Admin: Curricula',icon:BookOpen},
                    {id:'faculty',label:'Admin: Faculty Accounts',icon:Users}
                  ] : [])
                ].map(({id,label,icon:Icon}) => (
                  <button key={id} type="button"
                    aria-current={workspaceTab===id ? 'step' : undefined}
                    className={workspaceTab===id ? 'workspace-tab active' : 'workspace-tab'}
                    onClick={()=>showWorkspaceTab(id)}>
                    <Icon size={16}/>{label}
                  </button>
                ))}
              </div>
            </nav>
            <div className="workspace-content" key={workspaceTab}>
              {workspaceTab === 'account' && <MyAccount facultyId={profile.id} onAccountSaved={()=>loadProfile(profile.id)} />}
              {workspaceTab === 'information' && <GeneralInformation />}
              {workspaceTab === 'courses' && <CourseSelection facultyId={profile.id} isAdmin={profile.role === 'admin'} />}
              {workspaceTab === 'preview' && <SchedulePreview facultyId={profile.id} isAdmin={profile.role === 'admin'} />}
              {workspaceTab === 'availability' && <FacultyAvailability facultyId={profile.id} isAdmin={profile.role === 'admin'} />}
              {workspaceTab === 'scheduling' && <RoomScheduling facultyId={profile.id} isAdmin={profile.role === 'admin'} />}
              {workspaceTab === 'workload' && <OfficialWorkload facultyId={profile.id} isAdmin={profile.role === 'admin'} />}
              {profile.role === 'admin' && workspaceTab === 'reports' && <AdminScheduleReports />}
              {profile.role === 'admin' && workspaceTab === 'approval' && <AdministratorApproval />}
              {profile.role === 'admin' && workspaceTab === 'semester' && <AcademicTermSettings />}
              {profile.role === 'admin' && workspaceTab === 'curriculum' && <CurriculumManagement />}
              {profile.role === 'admin' && workspaceTab === 'faculty' && (
                <div className="panel admin">

                <div className="iconhead"><ShieldCheck /><span>Administrator · Faculty authorization</span></div>
                <p>Only the listed PSU email accounts may begin confirmation-link registration.</p>
                <form className="inviteform" onSubmit={addInvite}>
                  <label>Faculty email<input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required placeholder="instructor@psu.palawan.edu.ph" /></label>
                  <label>Department<select value={inviteDept} onChange={(e) => setInviteDept(e.target.value as 'BEEd' | 'BSE' | 'Administration')}><option value="BEEd">BEEd</option><option value="BSE">BSE</option><option value="Administration">Campus Administration</option></select></label>
                  <label>Role<select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'faculty' | 'admin')}><option value="faculty">Faculty</option><option value="admin">Administrator</option></select></label>
                  <button className="primary" disabled={busy}>Authorize email</button>
                </form>
                <h3>Authorized email list</h3>
                <div className="invites">
                  {invites.length ? invites.map((value) => (
                    <div key={value.email}>
                      <span>{value.email}<small>{value.department}</small></span>
                      <span className="pill">{adminEmails.includes(value.email) ? 'Admin · ' : ''}{value.used_at ? 'Registered' : 'Invited'}</span>
                    </div>
                  )) : <p>No invitations yet. Add your first faculty email.</p>}
                </div>
                </div>
              )}
            </div>
            <div className="workspace-next">
              {workspaceTab !== 'courses' && (
                <button type="button" className="ghost" onClick={()=>{
                  const order=['courses','preview','availability','scheduling','workload'];
                  const i=order.indexOf(workspaceTab);showWorkspaceTab(i>0?order[i-1]:'courses');
                }}>← Previous step</button>
              )}
              {['courses','preview','availability','scheduling'].includes(workspaceTab) && (
                <button type="button" className="primary" onClick={()=>{
                  const order=['courses','preview','availability','scheduling','workload'];
                  showWorkspaceTab(order[order.indexOf(workspaceTab)+1]);
                }}>Continue to {({courses:'Schedule Preview',preview:'Faculty Availability',availability:'Schedule & Rooms',scheduling:'Faculty Workload'} as Record<string,string>)[workspaceTab]} →</button>
              )}
              {workspaceTab === 'workload' && <span className="workspace-done">End of faculty workflow · You can return to any previous step using the tabs above.</span>}
            </div>
          </section>
        )}

        {message && <div className="notice" role="status">{message}</div>}

        <section className="features">
          <div><ShieldCheck /><strong>Corporate email protection</strong><small>PSU domain + verified invitation</small></div>
          <div><Users /><strong>Independent faculty records</strong><small>Separate from the examination system</small></div>
          <div><CalendarDays /><strong>Approval-led scheduling</strong><small>Administrator has final authority</small></div>
        </section>
      </main>

      {session && profile?.status==='active' && <FacultyHelpChat facultyId={profile.id} isAdmin={profile.role==='admin'}/>}
      <footer>Palawan State University · Balabac Campus <span>Phase 1 · Faculty Authentication</span></footer>
    </div>
  );
}
